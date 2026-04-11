import {
  and,
  clients,
  count,
  db,
  desc,
  eq,
  gte,
  locations,
  passInstances,
  rewards,
  sql,
  visits,
} from "@cuik/db"

// ─── Types ────────────────────────────────────────────────────────────

export interface TenantSummary {
  totalClients: number
  activeClients: number
  totalVisits: number
  rewardsRedeemed: number
  avgVisitsPerClient: number
}

export interface WeeklyComparison {
  thisWeek: { visits: number; newClients: number }
  lastWeek: { visits: number; newClients: number }
}

export interface TopClient {
  name: string
  lastName: string | null
  email: string | null
  totalVisits: number
  pointsBalance: number
  createdAt: Date
}

export interface RecentVisit {
  clientName: string
  visitNum: number
  points: number | null
  source: string
  createdAt: Date
}

export interface DayOfWeekVisits {
  day: string
  visits: number
}

export interface LocationVisits {
  locationName: string
  visits: number
}

export interface ClientSegment {
  segment: string
  count: number
}

export interface InactiveClient {
  name: string
  lastName: string | null
  email: string | null
  totalVisits: number
  lastVisitAt: Date
  daysSinceLastVisit: number
}

export interface MonthlyRetention {
  month: string
  registered: number
  visited: number
  retentionPct: number
}

export interface LocationWeeklyTrend {
  week: string
  locationName: string
  visits: number
}

export interface WalletAdoption {
  apple: number
  google: number
  none: number
  totalClients: number
}

export interface WeeklyNewClients {
  week: string
  count: number
}

export interface SegmentAvgInterval {
  segment: string
  avgDays: number
}

export interface ReportData {
  summary: TenantSummary
  weekly: WeeklyComparison
  topClients: TopClient[]
  recentVisits: RecentVisit[]
  byDayOfWeek: DayOfWeekVisits[]
  byLocation: LocationVisits[]
  segmentation: ClientSegment[]
  inactiveClients: InactiveClient[]
  retentionByMonth: MonthlyRetention[]
  visitsByLocationByWeek: LocationWeeklyTrend[]
  walletAdoption: WalletAdoption
  newClientsByWeek: WeeklyNewClients[]
  avgTimeBetweenVisits: SegmentAvgInterval[]
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
    thisWeek: { visits: thisWeekVisits?.total ?? 0, newClients: thisWeekClients?.total ?? 0 },
    lastWeek: { visits: lastWeekVisits?.total ?? 0, newClients: lastWeekClients?.total ?? 0 },
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

export async function getRecentVisits(tenantId: string, days = 14): Promise<RecentVisit[]> {
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

export async function getVisitsByDayOfWeek(tenantId: string): Promise<DayOfWeekVisits[]> {
  const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"]

  const rows = await db
    .select({
      dow: sql<number>`EXTRACT(DOW FROM ${visits.createdAt})::int`,
      total: count(),
    })
    .from(visits)
    .where(eq(visits.tenantId, tenantId))
    .groupBy(sql`EXTRACT(DOW FROM ${visits.createdAt})`)
    .orderBy(sql`EXTRACT(DOW FROM ${visits.createdAt})`)

  return rows.map((r) => ({
    day: dayNames[r.dow] ?? `Dia ${r.dow}`,
    visits: r.total,
  }))
}

export async function getVisitsByLocation(tenantId: string): Promise<LocationVisits[]> {
  const rows = await db
    .select({
      locationName: sql<string>`COALESCE(${locations.name}, 'Sin local')`,
      total: count(),
    })
    .from(visits)
    .leftJoin(locations, eq(visits.locationId, locations.id))
    .where(eq(visits.tenantId, tenantId))
    .groupBy(locations.name)
    .orderBy(desc(count()))

  return rows.map((r) => ({ locationName: r.locationName, visits: r.total }))
}

export async function getClientSegmentation(tenantId: string): Promise<ClientSegment[]> {
  const rows = await db
    .select({
      segment: sql<string>`CASE
        WHEN ${clients.totalVisits} = 1 THEN '1 visita'
        WHEN ${clients.totalVisits} BETWEEN 2 AND 3 THEN '2-3 visitas'
        WHEN ${clients.totalVisits} BETWEEN 4 AND 5 THEN '4-5 visitas'
        ELSE '6+ visitas'
      END`,
      total: count(),
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.status, "active")))
    .groupBy(
      sql`CASE
        WHEN ${clients.totalVisits} = 1 THEN '1 visita'
        WHEN ${clients.totalVisits} BETWEEN 2 AND 3 THEN '2-3 visitas'
        WHEN ${clients.totalVisits} BETWEEN 4 AND 5 THEN '4-5 visitas'
        ELSE '6+ visitas'
      END`,
    )

  return rows.map((r) => ({ segment: r.segment, count: r.total }))
}

export async function getInactiveClients(tenantId: string, days = 30): Promise<InactiveClient[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const rows = await db
    .select({
      name: clients.name,
      lastName: clients.lastName,
      email: clients.email,
      totalVisits: clients.totalVisits,
      lastVisitAt: sql<Date>`(SELECT MAX(v.created_at) FROM loyalty.visits v WHERE v.client_id = ${clients.id})`,
    })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clients.status, "active"),
        sql`(SELECT MAX(v.created_at) FROM loyalty.visits v WHERE v.client_id = ${clients.id}) < ${cutoff}`,
      ),
    )
    .orderBy(
      sql`(SELECT MAX(v.created_at) FROM loyalty.visits v WHERE v.client_id = ${clients.id})`,
    )
    .limit(20)

  const now = Date.now()
  return rows.map((r) => ({
    name: r.name,
    lastName: r.lastName,
    email: r.email,
    totalVisits: r.totalVisits,
    lastVisitAt: r.lastVisitAt,
    daysSinceLastVisit: Math.floor((now - new Date(r.lastVisitAt).getTime()) / 86_400_000),
  }))
}

export async function getRetentionByMonth(tenantId: string): Promise<MonthlyRetention[]> {
  const rows = await db
    .select({
      month: sql<string>`TO_CHAR(${clients.createdAt}, 'YYYY-MM')`,
      registered: count(),
      visited: count(sql`CASE WHEN ${clients.totalVisits} > 1 THEN 1 END`),
    })
    .from(clients)
    .where(eq(clients.tenantId, tenantId))
    .groupBy(sql`TO_CHAR(${clients.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${clients.createdAt}, 'YYYY-MM')`)

  return rows.map((r) => ({
    month: r.month,
    registered: r.registered,
    visited: r.visited,
    retentionPct: r.registered > 0 ? Math.round((r.visited / r.registered) * 100) : 0,
  }))
}

export async function getVisitsByLocationByWeek(tenantId: string): Promise<LocationWeeklyTrend[]> {
  const rows = await db
    .select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${visits.createdAt}), 'YYYY-MM-DD')`,
      locationName: sql<string>`COALESCE(${locations.name}, 'Sin local')`,
      total: count(),
    })
    .from(visits)
    .leftJoin(locations, eq(visits.locationId, locations.id))
    .where(eq(visits.tenantId, tenantId))
    .groupBy(sql`DATE_TRUNC('week', ${visits.createdAt})`, locations.name)
    .orderBy(sql`DATE_TRUNC('week', ${visits.createdAt})`)
    .limit(100)

  return rows.map((r) => ({ week: r.week, locationName: r.locationName, visits: r.total }))
}

export async function getWalletAdoption(tenantId: string): Promise<WalletAdoption> {
  const [totalRow] = await db
    .select({ total: count() })
    .from(clients)
    .where(eq(clients.tenantId, tenantId))

  const totalClients = totalRow?.total ?? 0

  const rows = await db
    .select({
      hasApple: sql<boolean>`${passInstances.applePassUrl} IS NOT NULL`,
      hasGoogle: sql<boolean>`${passInstances.googleSaveUrl} IS NOT NULL`,
    })
    .from(passInstances)
    .innerJoin(clients, eq(passInstances.clientId, clients.id))
    .where(eq(clients.tenantId, tenantId))

  let apple = 0
  let google = 0
  const clientsWithWallet = new Set<string>()

  for (const r of rows) {
    if (r.hasApple) apple++
    if (r.hasGoogle) google++
  }

  return {
    apple,
    google,
    none: Math.max(0, totalClients - rows.length),
    totalClients,
  }
}

export async function getNewClientsByWeek(tenantId: string): Promise<WeeklyNewClients[]> {
  const rows = await db
    .select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${clients.createdAt}), 'YYYY-MM-DD')`,
      total: count(),
    })
    .from(clients)
    .where(eq(clients.tenantId, tenantId))
    .groupBy(sql`DATE_TRUNC('week', ${clients.createdAt})`)
    .orderBy(sql`DATE_TRUNC('week', ${clients.createdAt})`)
    .limit(52)

  return rows.map((r) => ({ week: r.week, count: r.total }))
}

export async function getAverageTimeBetweenVisits(tenantId: string): Promise<SegmentAvgInterval[]> {
  const rows = await db.execute(sql`
    WITH visit_gaps AS (
      SELECT
        v.client_id,
        c.total_visits,
        EXTRACT(EPOCH FROM (v.created_at - LAG(v.created_at) OVER (
          PARTITION BY v.client_id ORDER BY v.created_at
        ))) / 86400.0 AS gap_days
      FROM loyalty.visits v
      JOIN loyalty.clients c ON c.id = v.client_id
      WHERE v.tenant_id = ${tenantId}
    ),
    client_avgs AS (
      SELECT
        client_id,
        total_visits,
        AVG(gap_days) AS avg_gap
      FROM visit_gaps
      WHERE gap_days IS NOT NULL
      GROUP BY client_id, total_visits
    )
    SELECT
      CASE
        WHEN total_visits BETWEEN 2 AND 3 THEN '2-3 visitas'
        WHEN total_visits BETWEEN 4 AND 5 THEN '4-5 visitas'
        ELSE '6+ visitas'
      END AS segment,
      ROUND(AVG(avg_gap)::numeric, 1) AS avg_days
    FROM client_avgs
    WHERE total_visits >= 2
    GROUP BY
      CASE
        WHEN total_visits BETWEEN 2 AND 3 THEN '2-3 visitas'
        WHEN total_visits BETWEEN 4 AND 5 THEN '4-5 visitas'
        ELSE '6+ visitas'
      END
    ORDER BY MIN(total_visits)
  `)

  return (rows.rows as Array<{ segment: string; avg_days: string }>).map((r) => ({
    segment: r.segment,
    avgDays: Number.parseFloat(r.avg_days),
  }))
}

// ─── Aggregated Context Builder ───────────────────────────────────────

export async function buildReportData(tenantId: string): Promise<ReportData> {
  const [
    summary,
    weekly,
    topClients,
    recentVisits,
    byDayOfWeek,
    byLocation,
    segmentation,
    inactiveClients,
    retentionByMonth,
    visitsByLocationByWeek,
    walletAdoption,
    newClientsByWeek,
    avgTimeBetweenVisits,
  ] = await Promise.all([
    getTenantSummary(tenantId),
    getWeeklyComparison(tenantId),
    getTopClients(tenantId, 10),
    getRecentVisits(tenantId, 14),
    getVisitsByDayOfWeek(tenantId),
    getVisitsByLocation(tenantId),
    getClientSegmentation(tenantId),
    getInactiveClients(tenantId, 30),
    getRetentionByMonth(tenantId),
    getVisitsByLocationByWeek(tenantId),
    getWalletAdoption(tenantId),
    getNewClientsByWeek(tenantId),
    getAverageTimeBetweenVisits(tenantId),
  ])

  return {
    summary,
    weekly,
    topClients,
    recentVisits,
    byDayOfWeek,
    byLocation,
    segmentation,
    inactiveClients,
    retentionByMonth,
    visitsByLocationByWeek,
    walletAdoption,
    newClientsByWeek,
    avgTimeBetweenVisits,
  }
}

export function formatDataContext(data: ReportData, tenantName: string): string {
  const lines: string[] = [
    `Datos de ${tenantName} (consultados: ${new Date().toISOString()}):`,
    "",
    "## Resumen General",
    `- Clientes totales: ${data.summary.totalClients}`,
    `- Clientes activos: ${data.summary.activeClients}`,
    `- Visitas totales: ${data.summary.totalVisits}`,
    `- Premios canjeados: ${data.summary.rewardsRedeemed}`,
    `- Promedio visitas/cliente: ${data.summary.avgVisitsPerClient}`,
    "",
    "## Comparacion Semanal",
    `- Esta semana: ${data.weekly.thisWeek.visits} visitas, ${data.weekly.thisWeek.newClients} clientes nuevos`,
    `- Semana anterior: ${data.weekly.lastWeek.visits} visitas, ${data.weekly.lastWeek.newClients} clientes nuevos`,
    `- Cambio visitas: ${data.weekly.lastWeek.visits > 0 ? `${Math.round(((data.weekly.thisWeek.visits - data.weekly.lastWeek.visits) / data.weekly.lastWeek.visits) * 100)}%` : "N/A"}`,
    "",
    "## Visitas por Dia de la Semana",
  ]

  for (const d of data.byDayOfWeek) {
    lines.push(`- ${d.day}: ${d.visits} visitas`)
  }

  lines.push("", "## Visitas por Local")
  for (const l of data.byLocation) {
    lines.push(`- ${l.locationName}: ${l.visits} visitas`)
  }

  lines.push("", "## Segmentacion de Clientes")
  for (const s of data.segmentation) {
    lines.push(`- ${s.segment}: ${s.count} clientes`)
  }

  lines.push("", "## Top 10 Clientes (por visitas)")
  for (const c of data.topClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    lines.push(`- ${name}: ${c.totalVisits} visitas, ${c.pointsBalance} puntos`)
  }

  lines.push("", `## Clientes Inactivos (30+ dias sin visita): ${data.inactiveClients.length}`)
  for (const c of data.inactiveClients.slice(0, 10)) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    lines.push(
      `- ${name}: ${c.daysSinceLastVisit} dias sin visita, ${c.totalVisits} visitas totales`,
    )
  }

  lines.push("", `## Visitas Recientes (ultimos 14 dias): ${data.recentVisits.length} registros`)
  for (const v of data.recentVisits.slice(0, 20)) {
    const date = new Date(v.createdAt).toLocaleDateString("es-MX")
    lines.push(
      `- ${date}: ${v.clientName} (visita #${v.visitNum}, ${v.points ?? 0} pts, ${v.source})`,
    )
  }
  if (data.recentVisits.length > 20) {
    lines.push(`  ... y ${data.recentVisits.length - 20} visitas mas`)
  }

  lines.push("", "## Retencion Mensual")
  for (const r of data.retentionByMonth) {
    lines.push(`- ${r.month}: ${r.visited}/${r.registered} retornaron (${r.retentionPct}%)`)
  }

  lines.push("", "## Adopcion de Wallet")
  lines.push(`- Apple Wallet: ${data.walletAdoption.apple} pases`)
  lines.push(`- Google Wallet: ${data.walletAdoption.google} pases`)
  lines.push(`- Sin wallet: ${data.walletAdoption.none} clientes`)
  lines.push(`- Total clientes: ${data.walletAdoption.totalClients}`)

  lines.push("", "## Clientes Nuevos por Semana")
  for (const w of data.newClientsByWeek.slice(-12)) {
    lines.push(`- Semana ${w.week}: ${w.count} nuevos`)
  }

  lines.push("", "## Tiempo Promedio entre Visitas (dias)")
  for (const s of data.avgTimeBetweenVisits) {
    lines.push(`- ${s.segment}: ${s.avgDays} dias promedio`)
  }

  return lines.join("\n")
}

/** Legacy wrapper — builds data + formats as text */
export async function buildDataContext(tenantId: string, tenantName: string): Promise<string> {
  console.log(`[data-queries] Building data context for ${tenantName} (${tenantId})`)
  const data = await buildReportData(tenantId)
  const text = formatDataContext(data, tenantName)
  console.log(`[data-queries] Context built: ${text.length} chars`)
  return text
}
