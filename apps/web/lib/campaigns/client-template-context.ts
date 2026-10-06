import {
  and,
  clients,
  count,
  db,
  eq,
  passDesigns,
  promotions,
  rewards,
  sql,
  tenants,
} from "@cuik/db"
import type { TemplateContext } from "@cuik/wallet/shared"
import { pointsExpiryTemplateVars } from "@/lib/loyalty/points-lots"

/**
 * Builds one TemplateContext per client so campaign messages can be resolved
 * server-side ({{client.name}}, {{points.balance}}, {{stamps.remaining}}...).
 *
 * Apple resolves these when the phone downloads the pass; Google Wallet has no
 * such hook, so the text must be final before calling addMessage.
 */
export async function buildClientTemplateContexts(
  tenantId: string,
  clientIds: string[],
): Promise<Map<string, TemplateContext>> {
  const contexts = new Map<string, TemplateContext>()
  if (clientIds.length === 0) return contexts

  const [tenantRow] = await db
    .select({ name: tenants.name, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const [activePromotion] = await db
    .select({ type: promotions.type })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .limit(1)
  const [activeDesign] = await db
    .select({ stampsConfig: passDesigns.stampsConfig })
    .from(passDesigns)
    .where(and(eq(passDesigns.tenantId, tenantId), eq(passDesigns.isActive, true)))
    .limit(1)
  const maxVisits = (activeDesign?.stampsConfig as { maxVisits?: number } | null)?.maxVisits ?? 8
  const isPoints = activePromotion?.type === "points"
  const timezone = tenantRow?.timezone ?? "America/Lima"

  const idList = sql.join(
    clientIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const clientRows = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      phone: clients.phone,
      email: clients.email,
      birthday: clients.birthday,
      tier: clients.tier,
      totalVisits: clients.totalVisits,
      pointsBalance: clients.pointsBalance,
      customData: clients.customData,
    })
    .from(clients)
    .where(sql`${clients.id} IN (${idList})`)

  const pendingRows = await db
    .select({ clientId: rewards.clientId, cnt: count() })
    .from(rewards)
    .where(and(eq(rewards.status, "pending"), sql`${rewards.clientId} IN (${idList})`))
    .groupBy(rewards.clientId)
  const pendingByClient = new Map(pendingRows.map((r) => [r.clientId, Number(r.cnt)]))

  for (const c of clientRows) {
    const stampsInCycle = maxVisits > 0 ? c.totalVisits % maxVisits : 0
    const expiry = isPoints
      ? await pointsExpiryTemplateVars(db, c.id, timezone)
      : { expiring: "", expiresAt: "" }
    contexts.set(c.id, {
      client: {
        name: c.name,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        birthday: (c.birthday as string | null) ?? null,
        tier: c.tier,
        totalVisits: c.totalVisits,
        pointsBalance: c.pointsBalance,
        customData: (c.customData as Record<string, unknown> | null) ?? null,
      },
      stamps: {
        current: stampsInCycle,
        max: maxVisits,
        remaining: maxVisits - stampsInCycle,
        total: c.totalVisits,
      },
      points: { balance: c.pointsBalance, ...expiry },
      rewards: { pending: pendingByClient.get(c.id) ?? 0 },
      tenant: { name: tenantRow?.name ?? "" },
    })
  }

  return contexts
}
