import { db, sql } from "@cuik/db"
import type { tenantTzLiteral } from "@/lib/analytics/tenant-tz"
import { parseVisitDate } from "@/lib/loyalty/visit-stats"
import { type Delta, delta, type Period } from "./period"

/**
 * Branch and cashier breakdown for the periodic report: who is (and who is
 * not) registering visits. Visits carry the branch the cashier picked in
 * Escanear (`location_id`, may be null) and the user who registered them
 * (`registered_by`). Everything is computed in the tenant timezone.
 */

export type BranchRow = {
  /** null = visits registered without choosing a branch. */
  id: string | null
  name: string
  active: boolean
  visits: number
  previousVisits: number
  delta: Delta
  uniqueClients: number
  /** Clients whose very first visit happened here during the period. */
  newClients: number
  /** Share of the period's visits, 0-100. */
  share: number
}

export type CashierRow = {
  id: string
  name: string
  role: "Cajero" | "Admin"
  visits: number
  previousVisits: number
  delta: Delta
  /** Days of the period with at least one visit registered. */
  activeDays: number
  /** visits / activeDays, one decimal. */
  perActiveDay: number
  /** Clients whose very first visit this person registered during the period. */
  newClients: number
  lastVisitAt: Date | null
}

export type TeamData = {
  branches: BranchRow[]
  cashiers: CashierRow[]
  /** Branch analysis is meaningful (two or more branches saw visits or exist). */
  showBranches: boolean
  /** Cashier analysis is meaningful (two or more people can register visits). */
  showCashiers: boolean
}

export const NO_BRANCH_LABEL = "Sin sucursal"

type SqlHelper = (col: string) => ReturnType<typeof sql>
type WithinHelper = (col: string, p: Period) => ReturnType<typeof sql>

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export async function computeTeam(params: {
  tenantId: string
  slug: string
  period: Period
  previous: Period
  tzLit: ReturnType<typeof tenantTzLiteral>
  local: SqlHelper
  within: WithinHelper
}): Promise<TeamData> {
  const { tenantId, slug, period, previous, local, within } = params

  // Clients' first visit ever (branch + who registered it), reused by both breakdowns.
  const firstVisit = sql`
    SELECT DISTINCT ON (v.client_id) v.client_id, v.location_id, v.registered_by, v.created_at
    FROM loyalty.visits v
    WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus'
    ORDER BY v.client_id, v.created_at ASC`

  // ── Branches ──────────────────────────────────────────────────────
  const [locRes, curLoc, prevLoc, newLoc] = await Promise.all([
    db.execute<{ id: string; name: string; active: boolean }>(sql`
      SELECT id, name, active FROM loyalty.locations WHERE tenant_id = ${tenantId} ORDER BY name ASC`),
    db.execute<{ location_id: string | null; visits: number; uniq: number }>(sql`
      SELECT v.location_id, COUNT(*)::int AS visits, COUNT(DISTINCT v.client_id)::int AS uniq
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", period)}
      GROUP BY 1`),
    db.execute<{ location_id: string | null; visits: number }>(sql`
      SELECT v.location_id, COUNT(*)::int AS visits
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", previous)}
      GROUP BY 1`),
    db.execute<{ location_id: string | null; n: number }>(sql`
      WITH f AS (${firstVisit})
      SELECT f.location_id, COUNT(*)::int AS n FROM f WHERE ${within("f.created_at", period)} GROUP BY 1`),
  ])
  const key = (id: string | null) => id ?? "__none__"
  const curByLoc = new Map(curLoc.rows.map((r) => [key(r.location_id), r]))
  const prevByLoc = new Map(prevLoc.rows.map((r) => [key(r.location_id), Number(r.visits)]))
  const newByLoc = new Map(newLoc.rows.map((r) => [key(r.location_id), Number(r.n)]))
  const totalVisits = curLoc.rows.reduce((s, r) => s + Number(r.visits), 0)

  const branchIds = new Set<string | null>()
  for (const l of locRes.rows) branchIds.add(l.id)
  for (const r of curLoc.rows) branchIds.add(r.location_id)
  for (const r of prevLoc.rows) branchIds.add(r.location_id)

  const names = new Map(locRes.rows.map((l) => [l.id, l]))
  const branches: BranchRow[] = [...branchIds].map((id) => {
    const cur = curByLoc.get(key(id))
    const visits = Number(cur?.visits ?? 0)
    const previousVisits = prevByLoc.get(key(id)) ?? 0
    const loc = id ? names.get(id) : undefined
    return {
      id,
      name: id ? (loc?.name ?? "Sucursal eliminada") : NO_BRANCH_LABEL,
      active: id ? Boolean(loc?.active) : true,
      visits,
      previousVisits,
      delta: delta(visits, previousVisits),
      uniqueClients: Number(cur?.uniq ?? 0),
      newClients: newByLoc.get(key(id)) ?? 0,
      share: totalVisits > 0 ? Math.round((visits / totalVisits) * 100) : 0,
    }
  })
  // Drop the "no branch" row when it is empty, and inactive branches without activity.
  const branchRows = branches
    .filter((b) => (b.id === null ? b.visits > 0 || b.previousVisits > 0 : true))
    .filter((b) => b.active || b.visits > 0 || b.previousVisits > 0)
    .sort((a, b) => {
      if (a.id === null) return 1
      if (b.id === null) return -1
      return b.visits - a.visits || a.name.localeCompare(b.name)
    })
  const realBranches = branchRows.filter((b) => b.id !== null)
  const showBranches = realBranches.length >= 2

  // ── Cashiers ──────────────────────────────────────────────────────
  const [members, curBy, prevBy, newBy] = await Promise.all([
    db.execute<{ id: string; name: string; email: string; role: string }>(sql`
      SELECT u.id, u.name, u.email, m.role
      FROM organization o
      JOIN member m ON m.organization_id = o.id
      JOIN "user" u ON u.id = m.user_id
      WHERE o.slug = ${slug}
      ORDER BY u.name ASC`),
    db.execute<{
      registered_by: string | null
      visits: number
      active_days: number
      last_visit_at: string | null
    }>(sql`
      SELECT v.registered_by, COUNT(*)::int AS visits,
        COUNT(DISTINCT to_char(${local("v.created_at")}, 'YYYY-MM-DD'))::int AS active_days,
        MAX(v.created_at) AS last_visit_at
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", period)}
      GROUP BY 1`),
    db.execute<{ registered_by: string | null; visits: number }>(sql`
      SELECT v.registered_by, COUNT(*)::int AS visits
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", previous)}
      GROUP BY 1`),
    db.execute<{ registered_by: string | null; n: number }>(sql`
      WITH f AS (${firstVisit})
      SELECT f.registered_by, COUNT(*)::int AS n FROM f WHERE ${within("f.created_at", period)} GROUP BY 1`),
  ])
  const curByUser = new Map(
    curBy.rows.filter((r) => r.registered_by).map((r) => [r.registered_by as string, r]),
  )
  const prevByUser = new Map(
    prevBy.rows
      .filter((r) => r.registered_by)
      .map((r) => [r.registered_by as string, Number(r.visits)]),
  )
  const newByUser = new Map(
    newBy.rows.filter((r) => r.registered_by).map((r) => [r.registered_by as string, Number(r.n)]),
  )

  const isAdmin = (role: string) => role === "owner" || role === "admin"
  const cashierRows: CashierRow[] = []
  for (const m of members.rows) {
    const cur = curByUser.get(m.id)
    const visits = Number(cur?.visits ?? 0)
    const previousVisits = prevByUser.get(m.id) ?? 0
    // Admins only appear when they actually registered visits.
    if (isAdmin(m.role) && visits === 0 && previousVisits === 0) continue
    const activeDays = Number(cur?.active_days ?? 0)
    cashierRows.push({
      id: m.id,
      name: m.name || m.email,
      role: isAdmin(m.role) ? "Admin" : "Cajero",
      visits,
      previousVisits,
      delta: delta(visits, previousVisits),
      activeDays,
      perActiveDay: activeDays > 0 ? round1(visits / activeDays) : 0,
      newClients: newByUser.get(m.id) ?? 0,
      lastVisitAt: parseVisitDate(cur?.last_visit_at ?? null),
    })
  }
  cashierRows.sort(
    (a, b) => b.visits - a.visits || a.role.localeCompare(b.role) || a.name.localeCompare(b.name),
  )
  const showCashiers = cashierRows.filter((c) => c.role === "Cajero").length >= 2

  return { branches: branchRows, cashiers: cashierRows, showBranches, showCashiers }
}
