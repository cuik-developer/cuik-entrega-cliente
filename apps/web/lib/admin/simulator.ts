import {
  and,
  appleDevices,
  clients,
  count,
  db,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  passInstances,
  promotions,
  rewards,
  tenants,
} from "@cuik/db"
import { getInternalTenantIds } from "@/lib/admin/internal-tenants"
import { stampsInCycleOf } from "@/lib/loyalty/stamps"

/**
 * Loyalty › Demos › Simulador: the Cuik team tries visits and campaigns on its
 * own demo comercios. A comercio is a demo only when it is listed in
 * Sistema › Configuración (internal_tenant_ids); every action re-checks it on
 * the server, so a real comercio can never be touched from here.
 */

export const NOT_A_DEMO_ERROR =
  "Este comercio no es una demo interna. Márcalo en Sistema › Configuración para usarlo aquí."

export type DemoTenant = {
  id: string
  name: string
  slug: string
  program: "stamps" | "points" | null
  maxVisits: number
}

/** Demo comercios with their active program, in name order. */
export async function listDemoTenants(): Promise<DemoTenant[]> {
  const ids = await getInternalTenantIds()
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(inArray(tenants.id, ids))
    .orderBy(tenants.name)
  const promos = await db
    .select({
      tenantId: promotions.tenantId,
      type: promotions.type,
      maxVisits: promotions.maxVisits,
    })
    .from(promotions)
    .where(and(inArray(promotions.tenantId, ids), eq(promotions.active, true)))
    .orderBy(desc(promotions.createdAt))
  // Newest active promotion per demo (the list is newest first, keep the first seen).
  const promoOf = new Map<string, (typeof promos)[number]>()
  for (const p of promos) if (!promoOf.has(p.tenantId)) promoOf.set(p.tenantId, p)
  return rows.map((t) => {
    const p = promoOf.get(t.id)
    const program = p?.type === "stamps" || p?.type === "points" ? p.type : null
    return { ...t, program, maxVisits: p?.maxVisits ?? 0 }
  })
}

/** The demo comercio, or null when the id is not in the internal list. */
export async function demoTenant(tenantId: string): Promise<DemoTenant | null> {
  const ids = await getInternalTenantIds()
  if (!ids.includes(tenantId)) return null
  const all = await listDemoTenants()
  return all.find((t) => t.id === tenantId) ?? null
}

export type DemoClientRow = {
  id: string
  name: string
  phone: string | null
  status: string
}

/** Clients of a demo comercio (deleted ones left out), newest first, optional search. */
export async function searchDemoClients(tenantId: string, q: string): Promise<DemoClientRow[]> {
  const term = q.trim().slice(0, 60)
  const conditions = [eq(clients.tenantId, tenantId), ne(clients.status, "deleted")]
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`
    const match = or(
      ilike(clients.name, like),
      ilike(clients.lastName, like),
      ilike(clients.phone, like),
      ilike(clients.dni, like),
    )
    if (match) conditions.push(match)
  }
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      phone: clients.phone,
      status: clients.status,
    })
    .from(clients)
    .where(and(...conditions))
    .orderBy(desc(clients.createdAt))
    .limit(25)
  return rows.map((r) => ({
    id: r.id,
    name: r.lastName ? `${r.name} ${r.lastName}` : r.name,
    phone: r.phone,
    status: r.status,
  }))
}

export type DemoClientState = {
  id: string
  name: string
  status: string
  qrCode: string | null
  totalVisits: number
  stampsInCycle: number
  maxVisits: number
  pointsBalance: number
  pendingRewards: number
  hasPass: boolean
  /** Apple Wallet devices registered for this client's pass. */
  appleDevices: number
}

/** Where a demo client stands: stamps or points, rewards to claim and pass status. */
export async function demoClientState(
  tenant: DemoTenant,
  clientId: string,
): Promise<DemoClientState | null> {
  const [c] = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      status: clients.status,
      qrCode: clients.qrCode,
      totalVisits: clients.totalVisits,
      stampsCashed: clients.stampsCashed,
      pointsBalance: clients.pointsBalance,
    })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
    .limit(1)
  if (!c) return null

  const [[pending], instances] = await Promise.all([
    db
      .select({ n: count() })
      .from(rewards)
      .where(and(eq(rewards.clientId, c.id), eq(rewards.status, "pending"))),
    db
      .select({ serial: passInstances.serialNumber })
      .from(passInstances)
      .where(eq(passInstances.clientId, c.id)),
  ])
  const serials = instances.map((i) => i.serial)
  const [devices] = serials.length
    ? await db
        .select({ n: count() })
        .from(appleDevices)
        .where(inArray(appleDevices.serialNumber, serials))
    : [{ n: 0 }]

  return {
    id: c.id,
    name: c.lastName ? `${c.name} ${c.lastName}` : c.name,
    status: c.status,
    qrCode: c.qrCode,
    totalVisits: c.totalVisits,
    stampsInCycle: stampsInCycleOf(
      { totalVisits: c.totalVisits, stampsCashed: c.stampsCashed ?? 0 },
      tenant.maxVisits,
    ),
    maxVisits: tenant.maxVisits,
    pointsBalance: c.pointsBalance,
    pendingRewards: pending?.n ?? 0,
    hasPass: instances.length > 0,
    appleDevices: devices?.n ?? 0,
  }
}
