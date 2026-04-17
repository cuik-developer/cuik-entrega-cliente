"use server"

import { clients, count, db, eq, gte, plans, sql, tenants, visits } from "@cuik/db"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"

// ── Types ───────────────────────────────────────────────────────────

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type DailyVisit = { date: string; count: number }
export type PlanDistItem = { planName: string; count: number; color: string }
export type TopTenant = { tenantName: string; visitCount: number; clientCount: number }
export type PlatformSummary = {
  totalTenants: number
  totalClients: number
  totalVisits30d: number
  totalPlans: number
}

// ── Auth ────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return { session: null, error: "No autenticado" } as const
  }

  const role = session.user.role ?? "user"
  if (role !== "super_admin") {
    return { session: null, error: "No autorizado — se requiere super_admin" } as const
  }

  return { session, error: null } as const
}

// ── Deterministic colors for plans ──────────────────────────────────

const PLAN_COLORS = [
  "#0e70db", // primary blue
  "#ff4810", // accent orange
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#64748b", // slate
]

function getPlanColor(index: number): string {
  return PLAN_COLORS[index % PLAN_COLORS.length]
}

// ── Actions ─────────────────────────────────────────────────────────

// Platform-wide super-admin metrics use a single reference timezone.
// Cuik primarily operates in Peru/Lima; this keeps daily buckets stable
// on the UI regardless of the server's OS timezone.
const PLATFORM_TZ = "America/Lima"

export async function getDailyVisits(days = 30): Promise<ActionResult<DailyVisit[]>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const since = new Date()
    since.setDate(since.getDate() - days)

    // Inline the tz literal (not as a bound parameter) so SELECT and GROUP BY
    // produce byte-identical expressions. If we interpolate tz via Drizzle's
    // ${tz} template, each usage becomes a separate $N placeholder and
    // Postgres treats the expressions as non-equal in GROUP BY comparisons,
    // throwing "must appear in the GROUP BY clause". PLATFORM_TZ is a
    // compile-time IANA constant so no injection risk.
    const tzLit = sql.raw(`'${PLATFORM_TZ}'`)
    const localDay = sql`date_trunc('day', ${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})::date`

    const rows = await db
      .select({
        date: sql<string>`${localDay}::text`,
        count: count(),
      })
      .from(visits)
      .where(gte(visits.createdAt, since))
      .groupBy(localDay)
      .orderBy(localDay)

    return {
      success: true,
      data: rows.map((r) => ({ date: r.date, count: Number(r.count) })),
    }
  } catch (err) {
    console.error("[getDailyVisits]", err)
    return { success: false, error: "Error al obtener visitas diarias" }
  }
}

export async function getPlanDistribution(): Promise<ActionResult<PlanDistItem[]>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const rows = await db
      .select({
        planName: plans.name,
        count: count(),
      })
      .from(tenants)
      .leftJoin(plans, eq(tenants.planId, plans.id))
      .groupBy(plans.name)
      .orderBy(sql`count(*) desc`)

    return {
      success: true,
      data: rows.map((r, i) => ({
        planName: r.planName ?? "Sin plan",
        count: Number(r.count),
        color: getPlanColor(i),
      })),
    }
  } catch (err) {
    console.error("[getPlanDistribution]", err)
    return { success: false, error: "Error al obtener distribución de planes" }
  }
}

export async function getTopTenants(limit = 5): Promise<ActionResult<TopTenant[]>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    // "Last 30 days" rolling window — UTC is fine for this coarse filter
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const visitCountSq = db
      .select({
        tenantId: visits.tenantId,
        visitCount: count().as("visit_count"),
      })
      .from(visits)
      .where(gte(visits.createdAt, since))
      .groupBy(visits.tenantId)
      .as("visit_counts")

    const clientCountSq = db
      .select({
        tenantId: clients.tenantId,
        clientCount: count().as("client_count"),
      })
      .from(clients)
      .groupBy(clients.tenantId)
      .as("client_counts")

    const rows = await db
      .select({
        tenantName: tenants.name,
        visitCount: sql<number>`coalesce(${visitCountSq.visitCount}, 0)`,
        clientCount: sql<number>`coalesce(${clientCountSq.clientCount}, 0)`,
      })
      .from(tenants)
      .leftJoin(visitCountSq, eq(tenants.id, visitCountSq.tenantId))
      .leftJoin(clientCountSq, eq(tenants.id, clientCountSq.tenantId))
      .orderBy(sql`coalesce(${visitCountSq.visitCount}, 0) desc`)
      .limit(limit)

    return {
      success: true,
      data: rows.map((r) => ({
        tenantName: r.tenantName,
        visitCount: Number(r.visitCount),
        clientCount: Number(r.clientCount),
      })),
    }
  } catch (err) {
    console.error("[getTopTenants]", err)
    return { success: false, error: "Error al obtener top tenants" }
  }
}

export async function getPlatformSummary(): Promise<ActionResult<PlatformSummary>> {
  const { error } = await requireSuperAdmin()
  if (error) return { success: false, error }

  try {
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const [tenantsResult, clientsResult, visitsResult, plansResult] = await Promise.all([
      db.select({ count: count() }).from(tenants).where(eq(tenants.status, "active")),
      db.select({ count: count() }).from(clients),
      db.select({ count: count() }).from(visits).where(gte(visits.createdAt, since)),
      db.select({ count: count() }).from(plans),
    ])

    return {
      success: true,
      data: {
        totalTenants: Number(tenantsResult[0].count),
        totalClients: Number(clientsResult[0].count),
        totalVisits30d: Number(visitsResult[0].count),
        totalPlans: Number(plansResult[0].count),
      },
    }
  } catch (err) {
    console.error("[getPlatformSummary]", err)
    return { success: false, error: "Error al obtener resumen de plataforma" }
  }
}
