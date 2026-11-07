"use server"

import { campaignSegments, campaigns, db, eq, tenants } from "@cuik/db"
import { z } from "zod"
import { recordProductChange } from "@/lib/admin/product-changes"
import {
  type DemoClientRow,
  type DemoClientState,
  demoClientState,
  demoTenant,
  NOT_A_DEMO_ERROR,
  searchDemoClients,
} from "@/lib/admin/simulator"
import { requireSuperAdminOrAction } from "@/lib/admin-access"
import { executeCampaign } from "@/lib/campaigns"
import { registerVisit } from "@/lib/loyalty"
import { cardCompleteNotice } from "@/lib/loyalty/card-complete"
import { VISIT_FALLBACK, visitRejectionMessage } from "@/lib/loyalty/cashier-messages"
import { triggerWalletUpdate } from "@/lib/wallet/trigger-wallet-update"

type Result<T> = { success: true; data: T } | { success: false; error: string }

const requireSimulator = () => requireSuperAdminOrAction("simulator")
const uuid = z.string().uuid()

export async function findDemoClients(
  tenantId: string,
  q: string,
): Promise<Result<DemoClientRow[]>> {
  const { error } = await requireSimulator()
  if (error) return { success: false, error }
  if (!uuid.safeParse(tenantId).success) return { success: false, error: NOT_A_DEMO_ERROR }
  const tenant = await demoTenant(tenantId)
  if (!tenant) return { success: false, error: NOT_A_DEMO_ERROR }
  return { success: true, data: await searchDemoClients(tenant.id, String(q ?? "")) }
}

export async function getDemoClient(
  tenantId: string,
  clientId: string,
): Promise<Result<DemoClientState>> {
  const { error } = await requireSimulator()
  if (error) return { success: false, error }
  if (!uuid.safeParse(tenantId).success || !uuid.safeParse(clientId).success) {
    return { success: false, error: "Cliente no encontrado" }
  }
  const tenant = await demoTenant(tenantId)
  if (!tenant) return { success: false, error: NOT_A_DEMO_ERROR }
  const state = await demoClientState(tenant, clientId)
  return state ? { success: true, data: state } : { success: false, error: "Cliente no encontrado" }
}

const visitInput = z.object({
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  /** Points programs only: the purchase amount in soles. */
  /** Same cap as the cashier (visit-schema): S/ 10,000 per purchase. */
  amount: z.number().positive().max(10000, "El monto máximo por compra es S/ 10,000").optional(),
})

function visitMessage(cardComplete: boolean, stamps: string | null, points: number | null) {
  if (cardComplete) return "Tarjeta completa: el pase ya muestra el premio."
  if (stamps) return `Visita registrada · sello ${stamps}. Pase actualizado.`
  if (points !== null) return `Visita registrada · ${points} puntos. Pase actualizado.`
  return "Visita registrada. Pase actualizado."
}

/**
 * Same path as the cashier (registerVisit + the wallet refresh the visits
 * route runs), on a demo comercio only. The visit is recorded with the
 * Cuik team member as cashier and source "manual".
 */
export async function simulateVisit(
  input: z.infer<typeof visitInput>,
): Promise<Result<{ message: string; state: DemoClientState | null }>> {
  const guard = await requireSimulator()
  if (guard.error !== null) return { success: false, error: guard.error }
  const parsed = visitInput.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" }
  }
  const { tenantId, clientId, amount } = parsed.data

  const tenant = await demoTenant(tenantId)
  if (!tenant) return { success: false, error: NOT_A_DEMO_ERROR }
  if (tenant.program === "points" && amount === undefined) {
    return { success: false, error: "Ingresa el monto de la compra para sumar puntos." }
  }
  const before = await demoClientState(tenant, clientId)
  if (!before?.qrCode) return { success: false, error: "Cliente no encontrado" }

  const [tenantRow] = await db
    .select({ name: tenants.name, automations: tenants.automations })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1)

  let result: Awaited<ReturnType<typeof registerVisit>>
  try {
    result = await registerVisit({
      qrCode: before.qrCode,
      tenantId: tenant.id,
      cashierId: guard.session.user.id,
      amount: amount?.toString(),
      source: "manual",
    })
  } catch (err) {
    console.error("[simulateVisit]", err)
    return { success: false, error: VISIT_FALLBACK }
  }
  if (result.code !== "OK") {
    return { success: false, error: visitRejectionMessage(result.code) }
  }

  // Narrowed once: a stamps result carries the card, a points result the balance.
  const st = "stamps" in result ? result : null
  const tenantName = tenantRow?.name ?? tenant.name
  // Mirrors POST /api/[tenant]/visits so the demo pass behaves like a real one.
  await triggerWalletUpdate({
    qrCode: before.qrCode,
    clientId: result.client.id,
    clientName: `${result.client.name}${result.client.lastName ? ` ${result.client.lastName}` : ""}`,
    tenantId: tenant.id,
    tenantName,
    stampsInCycle: st ? st.stamps.current : 0,
    maxVisits: st ? st.stamps.max : 0,
    totalVisits: result.client.totalVisits,
    pendingRewards: st ? st.pendingRewards : 0,
    pointsBalance: "pointsBalance" in result.client ? result.client.pointsBalance : 0,
    milestoneMessage: st
      ? ((st.cycleComplete
          ? cardCompleteNotice(tenantRow?.automations, {
              clientName: result.client.name,
              tenantName,
              reward: st.rewardValue,
            })
          : null) ??
        st.milestone?.message ??
        null)
      : undefined,
  }).catch((err) => console.error("[simulateVisit] wallet update", err))

  const stamps = st ? `${st.stamps.current} de ${st.stamps.max}` : null
  const points = "pointsBalance" in result.client ? result.client.pointsBalance : null
  await recordProductChange({
    actor: guard.session,
    tenantId: tenant.id,
    area: "simulator",
    action: "visit_registered",
    targetId: clientId,
    targetName: before.name,
    detail: { stamps, points, amount: amount ?? null },
  })

  const message = visitMessage(Boolean(st?.cycleComplete), stamps, points)
  return { success: true, data: { message, state: await demoClientState(tenant, clientId) } }
}

const campaignInput = z.object({
  tenantId: z.string().uuid(),
  /** One test client, or null for every client of the demo. */
  clientId: z.string().uuid().nullable(),
  message: z.string().trim().min(1, "Escribe el mensaje").max(500),
})

/**
 * A real push campaign on a demo comercio, created and sent at once. The
 * campaign engine already leaves out archived and deleted clients.
 */
export async function simulateCampaign(
  input: z.infer<typeof campaignInput>,
): Promise<Result<{ message: string }>> {
  const guard = await requireSimulator()
  if (guard.error !== null) return { success: false, error: guard.error }
  const parsed = campaignInput.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" }
  }
  const { tenantId, clientId, message } = parsed.data

  const tenant = await demoTenant(tenantId)
  if (!tenant) return { success: false, error: NOT_A_DEMO_ERROR }
  let targetName = "Todos los clientes"
  if (clientId) {
    const client = await demoClientState(tenant, clientId)
    if (!client) return { success: false, error: "Cliente no encontrado" }
    targetName = client.name
  }

  const stamp = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date())
  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: tenant.id,
      name: `Simulador · ${stamp}`,
      type: "push",
      message,
      status: "draft",
      createdBy: guard.session.user.id,
    })
    .returning({ id: campaigns.id })
  const segment = clientId ? { clientIds: [clientId] } : { preset: "todos" as const }
  await db.insert(campaignSegments).values({
    campaignId: campaign.id,
    segmentName: clientId ? "lista" : "todos",
    filter: segment,
  })

  const result = await executeCampaign(campaign.id)
  await recordProductChange({
    actor: guard.session,
    tenantId: tenant.id,
    area: "simulator",
    action: "campaign_sent",
    targetId: campaign.id,
    targetName,
    detail: { status: result.status, sent: result.sentCount, target: result.targetCount, message },
  })
  if (result.status === "failed") {
    // Nothing went out: close it so the test draft cannot be re-sent from the demo panel.
    await db
      .update(campaigns)
      .set({ status: "cancelled" })
      .where(eq(campaigns.id, campaign.id))
      .catch((err) => console.error("[simulateCampaign] cancel failed draft", err))
    return {
      success: false,
      error: `No se pudo enviar: ${result.errors[0] ?? "error desconocido"}`,
    }
  }
  return {
    success: true,
    data: {
      message:
        result.sentCount === 0
          ? "Campaña creada, pero nadie la recibió: ningún cliente activo con el pase instalado."
          : `Campaña enviada a ${result.sentCount} ${result.sentCount === 1 ? "cliente" : "clientes"}${
              result.skippedCount > 0 ? ` · ${result.skippedCount} sin pase instalado` : ""
            }.`,
    },
  }
}
