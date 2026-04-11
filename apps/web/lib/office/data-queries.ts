import { and, clients, count, db, desc, eq, gte, rewards, sql, visits } from "@cuik/db"

// ─── Types ────────────────────────────────────────────────────────────

interface TenantSummary {
  totalClients: number
  activeClients: number
  totalVisits: number
  rewardsRedeemed: number
  avgVisitsPerClient: number
}

interface WeeklyComparison {
  thisWeek: { visits: number; newClients: number }
  lastWeek: { visits: number; newClients: number }
}

interface TopClient {
  name: string
  lastName: string | null
  email: string | null
  totalVisits: number
  pointsBalance: number
  createdAt: Date
}

interface RecentVisit {
  clientName: string
  visitNum: number
  points: number | null
  source: string
  createdAt: Date
}

// ─── Query Functions ──────────────────────────────────────────────────

export async function getTenantSummary(tenantId: string): Promise<TenantSummary> {
  const [clientStats] = await db
    .select({
      total: count(),
      active: count(sql`CASE WHEN ${clients.status} = 'active' THEN 1 END`),
      avgVisits: sql<number>`COALESCE(AVG(${clients.totalVisits}), 0)`,
    })
    .from(clients)
    .where(eq(clients.tenantId, tenantId))

  const [visitStats] = await db
    .select({ total: count() })
    .from(visits)
    .where(eq(visits.tenantId, tenantId))

  const [rewardStats] = await db
    .select({ total: count() })
    .from(rewards)
    .where(and(eq(rewards.tenantId, tenantId), eq(rewards.status, "redeemed")))

  return {
    totalClients: clientStats?.total ?? 0,
    activeClients: clientStats?.active ?? 0,
    totalVisits: visitStats?.total ?? 0,
    rewardsRedeemed: rewardStats?.total ?? 0,
    avgVisitsPerClient: Math.round((clientStats?.avgVisits ?? 0) * 10) / 10,
  }
}

export async function getWeeklyComparison(tenantId: string): Promise<WeeklyComparison> {
  const now = new Date()
  const startOfThisWeek = new Date(now)
  startOfThisWeek.setDate(now.getDate() - now.getDay())
  startOfThisWeek.setHours(0, 0, 0, 0)

  const startOfLastWeek = new Date(startOfThisWeek)
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)

  const [thisWeekVisits] = await db
    .select({ total: count() })
    .from(visits)
    .where(and(eq(visits.tenantId, tenantId), gte(visits.createdAt, startOfThisWeek)))

  const [lastWeekVisits] = await db
    .select({ total: count() })
    .from(visits)
    .where(
      and(
        eq(visits.tenantId, tenantId),
        gte(visits.createdAt, startOfLastWeek),
        sql`${visits.createdAt} < ${startOfThisWeek}`,
      ),
    )

  const [thisWeekClients] = await db
    .select({ total: count() })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), gte(clients.createdAt, startOfThisWeek)))

  const [lastWeekClients] = await db
    .select({ total: count() })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        gte(clients.createdAt, startOfLastWeek),
        sql`${clients.createdAt} < ${startOfThisWeek}`,
      ),
    )

  return {
    thisWeek: {
      visits: thisWeekVisits?.total ?? 0,
      newClients: thisWeekClients?.total ?? 0,
    },
    lastWeek: {
      visits: lastWeekVisits?.total ?? 0,
      newClients: lastWeekClients?.total ?? 0,
    },
  }
}

export async function getTopClients(tenantId: string, limit = 10): Promise<TopClient[]> {
  return db
    .select({
      name: clients.name,
      lastName: clients.lastName,
      email: clients.email,
      totalVisits: clients.totalVisits,
      pointsBalance: clients.pointsBalance,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.status, "active")))
    .orderBy(desc(clients.totalVisits))
    .limit(limit)
}

export async function getRecentVisits(tenantId: string, days = 7): Promise<RecentVisit[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  return db
    .select({
      clientName: clients.name,
      visitNum: visits.visitNum,
      points: visits.points,
      source: visits.source,
      createdAt: visits.createdAt,
    })
    .from(visits)
    .innerJoin(clients, eq(visits.clientId, clients.id))
    .where(and(eq(visits.tenantId, tenantId), gte(visits.createdAt, since)))
    .orderBy(desc(visits.createdAt))
    .limit(50)
}

// ─── Aggregated Context Builder ───────────────────────────────────────

/**
 * Fetches all relevant data for a tenant and formats it as a text block
 * to inject into the agent's prompt as [DB_CONTEXT].
 */
export async function buildDataContext(tenantId: string, tenantName: string): Promise<string> {
  console.log(`[data-queries] Building data context for tenant ${tenantName} (${tenantId})`)

  const [summary, weekly, topClients, recentVisits] = await Promise.all([
    getTenantSummary(tenantId),
    getWeeklyComparison(tenantId),
    getTopClients(tenantId, 10),
    getRecentVisits(tenantId, 14),
  ])

  const lines: string[] = [
    `Datos de ${tenantName} (consultados: ${new Date().toISOString()}):`,
    "",
    "## Resumen General",
    `- Clientes totales: ${summary.totalClients}`,
    `- Clientes activos: ${summary.activeClients}`,
    `- Visitas totales: ${summary.totalVisits}`,
    `- Premios canjeados: ${summary.rewardsRedeemed}`,
    `- Promedio visitas/cliente: ${summary.avgVisitsPerClient}`,
    "",
    "## Comparacion Semanal",
    `- Esta semana: ${weekly.thisWeek.visits} visitas, ${weekly.thisWeek.newClients} clientes nuevos`,
    `- Semana anterior: ${weekly.lastWeek.visits} visitas, ${weekly.lastWeek.newClients} clientes nuevos`,
    `- Cambio visitas: ${weekly.lastWeek.visits > 0 ? `${Math.round(((weekly.thisWeek.visits - weekly.lastWeek.visits) / weekly.lastWeek.visits) * 100)}%` : "N/A"}`,
    "",
    "## Top 10 Clientes (por visitas)",
  ]

  for (const c of topClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    lines.push(`- ${name}: ${c.totalVisits} visitas, ${c.pointsBalance} puntos`)
  }

  lines.push("", `## Visitas Recientes (ultimos 14 dias): ${recentVisits.length} registros`)

  for (const v of recentVisits.slice(0, 20)) {
    const date = new Date(v.createdAt).toLocaleDateString("es-MX")
    lines.push(
      `- ${date}: ${v.clientName} (visita #${v.visitNum}, ${v.points ?? 0} pts, ${v.source})`,
    )
  }

  if (recentVisits.length > 20) {
    lines.push(`  ... y ${recentVisits.length - 20} visitas mas`)
  }

  console.log(`[data-queries] Context built: ${lines.length} lines`)
  return lines.join("\n")
}
