import { db, sql } from "@cuik/db"
import { tallySegments } from "@/lib/analytics/compute-segments"
import { tenantTzLiteral } from "@/lib/analytics/tenant-tz"
import { upcomingBirthdays } from "@/lib/campaigns/birthday"
import { getAtRiskClients } from "@/lib/loyalty/churn-detection"
import type { ClientSegment, SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { computeClientSegment, getThresholds, SEGMENT_LABELS } from "@/lib/loyalty/client-segments"
import { parseAvgDays, parseVisitDate } from "@/lib/loyalty/visit-stats"
import {
  addDays,
  type Delta,
  daysInMonth,
  delta,
  eachDay,
  eachMonth,
  lastClosedMonth,
  lastClosedWeek,
  monthName,
  monthPeriod,
  type Period,
  periodLabel,
  previousMonth,
  previousWeek,
  type ReportKind,
  sameMonthLastYear,
  weekdayName,
} from "./period"

/**
 * One engine for the weekly and monthly reports (the monthly one carries the
 * all-time section). Everything is computed in the tenant's timezone from the
 * raw tables, the same way the Dashboard and Analítica do, so the email never
 * disagrees with the panel.
 */

export type ProgramType = "stamps" | "points"

export type ReportKpi = { current: number; previous: number; delta: Delta }

export type DailyRow = {
  date: string
  weekday: string
  visits: number
  uniqueClients: number
  newClients: number
  rewardsRedeemed: number
  peakHour: string | null
}

export type ClientRow = {
  id: string
  name: string
  periodVisits: number
  totalVisits: number
  lastVisitAt: Date | null
  /** "3 de 6" (stamps) or "580 pts" (points). */
  progress: string
  segment: string
  pendingReward: boolean
  /** Sum of purchase amounts in the period (points programs record it). */
  amount: number | null
}

export type AtRiskRow = {
  id: string
  name: string
  totalVisits: number
  lastVisitAt: Date | null
  daysSince: number
  progress: string
}

export type BirthdayRow = { name: string; date: string; weekday: string; autoPush: string }

export type CampaignRow = { name: string; sentAt: Date | null; sentCount: number }

export type WeekRow = {
  label: string
  start: string
  end: string
  visits: number
  newClients: number
  rewardsRedeemed: number
}

export type MonthRow = {
  ym: string
  label: string
  visits: number
  newClients: number
  rewardsRedeemed: number
}

export type Cumulative = {
  since: string
  sinceLabel: string
  totals: {
    visits: number
    clients: number
    activeClients: number
    rewardsRedeemed: number
    avgVisitsPerClient: number
  }
  months: MonthRow[]
  bestMonth: MonthRow | null
  topClients: Array<{
    name: string
    totalVisits: number
    lastVisitAt: Date | null
    progress: string
  }>
  segments: Array<{ label: string; count: number }>
}

export type ReportData = {
  kind: ReportKind
  tenant: {
    id: string
    slug: string
    name: string
    timezone: string
    programType: ProgramType
    stampsTarget: number | null
  }
  period: Period
  previous: Period
  periodLabel: string
  compareLabel: string
  kpis: {
    visits: ReportKpi
    uniqueClients: ReportKpi
    newClients: ReportKpi
    rewardsRedeemed: ReportKpi
  }
  daily: DailyRow[]
  bestDay: DailyRow | null
  worstDay: DailyRow | null
  repeatClients: number
  campaigns: CampaignRow[]
  clients: ClientRow[]
  topClients: ClientRow[]
  atRisk: AtRiskRow[]
  /** Stamps: rewards pending redemption. Points: clients whose balance reaches the cheapest catalog item. */
  actionable: { label: string; count: number }
  birthdays: BirthdayRow[]
  birthdayAutomationEnabled: boolean
  /** Only on monthly reports. */
  monthly: {
    weeks: WeekRow[]
    lastYearVisits: number | null
    cumulative: Cumulative
  } | null
}

type TenantRow = {
  id: string
  slug: string
  name: string
  timezone: string
  business_type: string | null
  segmentation_config: unknown
  automations: unknown
  created_at: string
}

type PromoRow = { type: string; max_visits: number | null } | undefined

function kpi(current: number, previous: number): ReportKpi {
  return { current, previous, delta: delta(current, previous) }
}

function fullName(name: string, lastName: string | null): string {
  return [name, lastName].filter(Boolean).join(" ")
}

function progressLabel(
  program: ProgramType,
  stamps: number,
  target: number | null,
  points: number,
) {
  if (program === "points") return `${points} pts`
  return target ? `${stamps} de ${target}` : `${stamps}`
}

/** "YYYY-MM-DD" of a UTC timestamp in the tenant timezone. */
function toLocalDate(ts: string | Date, tz: string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts
  return d.toLocaleDateString("en-CA", { timeZone: tz })
}

// ── Public entry points ─────────────────────────────────────────────

export async function computeReport(params: {
  tenantId: string
  kind: ReportKind
  /** Local "today"; the report covers the last closed period before it. */
  todayLocal: string
  /** Override: report exactly this period (e.g. the on-demand cumulative). */
  period?: Period
}): Promise<ReportData> {
  const { tenantId, kind } = params

  const tenantRes = await db.execute<TenantRow>(sql`
    SELECT id, slug, name, timezone, business_type, segmentation_config, automations, created_at
    FROM tenants WHERE id = ${tenantId} LIMIT 1`)
  const tenant = tenantRes.rows[0]
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`)
  const tz = tenant.timezone ?? "America/Lima"
  const tzLit = tenantTzLiteral(tz)

  const promoRes = await db.execute<NonNullable<PromoRow>>(sql`
    SELECT type, max_visits FROM loyalty.promotions
    WHERE tenant_id = ${tenantId} AND active = true LIMIT 1`)
  const promo: PromoRow = promoRes.rows[0]
  const programType: ProgramType = promo?.type === "points" ? "points" : "stamps"
  const stampsTarget = programType === "stamps" ? (promo?.max_visits ?? null) : null

  const thresholds = getThresholds(
    tenant.business_type,
    tenant.segmentation_config as Partial<SegmentationThresholds> | null,
  )

  const period =
    params.period ??
    (kind === "weekly" ? lastClosedWeek(params.todayLocal) : lastClosedMonth(params.todayLocal))
  const previous = kind === "weekly" ? previousWeek(period) : previousMonth(period)

  // Local-time version of a timestamp column ("col" is a fixed identifier).
  const local = (col: string) => sql`(${sql.raw(col)} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
  const within = (col: string, p: Period) =>
    sql`${local(col)} >= ${p.start}::date AND ${local(col)} < (${p.end}::date + 1)`

  const redeemedWithin = (p: Period) =>
    programType === "points"
      ? sql`(SELECT COUNT(*)::int FROM loyalty.points_transactions t WHERE t.tenant_id = ${tenantId} AND t.type = 'redeem' AND ${within("t.created_at", p)})`
      : sql`(SELECT COUNT(*)::int FROM loyalty.rewards r WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL AND ${within("r.redeemed_at", p)})`

  const totalsFor = async (p: Period) => {
    const res = await db.execute<{
      visits: number
      unique_clients: number
      new_clients: number
      redeemed: number
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${within("v.created_at", p)}) AS visits,
        (SELECT COUNT(DISTINCT v.client_id)::int FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${within("v.created_at", p)}) AS unique_clients,
        (SELECT COUNT(*)::int FROM loyalty.clients c WHERE c.tenant_id = ${tenantId} AND ${within("c.created_at", p)}) AS new_clients,
        ${redeemedWithin(p)} AS redeemed`)
    const r = res.rows[0]
    return {
      visits: Number(r?.visits ?? 0),
      uniqueClients: Number(r?.unique_clients ?? 0),
      newClients: Number(r?.new_clients ?? 0),
      redeemed: Number(r?.redeemed ?? 0),
    }
  }

  const [cur, prev] = await Promise.all([totalsFor(period), totalsFor(previous)])

  const daily = await dailyRows({ tenantId, period, programType, local, within })
  const withVisits = daily.filter((d) => d.visits > 0)
  const bestDay = withVisits.length
    ? withVisits.reduce((a, b) => (b.visits > a.visits ? b : a))
    : null
  const worstDay = withVisits.length ? daily.reduce((a, b) => (b.visits < a.visits ? b : a)) : null

  // ── Clients who visited in the period ─────────────────────────────
  const clientsRes = await db.execute<{
    id: string
    name: string
    last_name: string | null
    total_visits: number
    points_balance: number
    created_at: string
    period_visits: number
    amount: string | null
    last_visit_at: string | null
    avg_days: string | null
    cycle_visits: number
    pending_reward: boolean
  }>(sql`
    WITH pv AS (
      SELECT v.client_id, COUNT(*)::int AS period_visits, SUM(v.amount) AS amount
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND ${within("v.created_at", period)}
      GROUP BY v.client_id
    ),
    stats AS (
      SELECT v.client_id,
        MAX(v.created_at) AS last_visit_at,
        CASE WHEN COUNT(*) >= 2
          THEN EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(*) - 1, 0)
          ELSE NULL END AS avg_days
      FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} GROUP BY v.client_id
    )
    SELECT c.id, c.name, c.last_name, c.total_visits, c.points_balance, c.created_at,
      pv.period_visits, pv.amount, stats.last_visit_at, stats.avg_days,
      (SELECT COUNT(*)::int FROM loyalty.visits v3 WHERE v3.client_id = c.id AND v3.cycle_number = c.current_cycle) AS cycle_visits,
      EXISTS (SELECT 1 FROM loyalty.rewards r WHERE r.client_id = c.id AND r.status = 'pending') AS pending_reward
    FROM loyalty.clients c
    JOIN pv ON pv.client_id = c.id
    LEFT JOIN stats ON stats.client_id = c.id
    WHERE c.tenant_id = ${tenantId}
    ORDER BY pv.period_visits DESC, c.total_visits DESC, c.name ASC`)

  const clientRows: ClientRow[] = clientsRes.rows.map((r) => ({
    id: r.id,
    name: fullName(r.name, r.last_name),
    periodVisits: Number(r.period_visits),
    totalVisits: Number(r.total_visits),
    lastVisitAt: parseVisitDate(r.last_visit_at),
    progress: progressLabel(
      programType,
      Number(r.cycle_visits),
      stampsTarget,
      Number(r.points_balance),
    ),
    segment:
      SEGMENT_LABELS[
        computeClientSegment(
          {
            createdAt: new Date(r.created_at),
            totalVisits: Number(r.total_visits),
            lastVisitAt: parseVisitDate(r.last_visit_at),
            avgDaysBetweenVisits: parseAvgDays(r.avg_days),
          },
          thresholds,
        )
      ],
    pendingReward: Boolean(r.pending_reward),
    amount: r.amount != null ? Number(r.amount) : null,
  }))
  const repeatClients = clientRows.filter((c) => c.periodVisits >= 2).length

  // ── Campaigns sent in the period ──────────────────────────────────
  const campaignsRes = await db.execute<{
    name: string
    sent_at: string | null
    sent_count: number
  }>(sql`
    SELECT name, sent_at, sent_count FROM campaigns.campaigns
    WHERE tenant_id = ${tenantId} AND status = 'sent' AND sent_at IS NOT NULL AND ${within("sent_at", period)}
    ORDER BY sent_at ASC`)
  const campaignRows: CampaignRow[] = campaignsRes.rows.map((r) => ({
    name: r.name,
    sentAt: r.sent_at ? new Date(r.sent_at) : null,
    sentCount: Number(r.sent_count),
  }))

  // ── At risk (now) ─────────────────────────────────────────────────
  const atRiskRaw = await getAtRiskClients(tenantId, thresholds)
  const progressById = await progressFor(
    tenantId,
    atRiskRaw.map((c) => c.id),
    programType,
    stampsTarget,
  )
  const atRisk: AtRiskRow[] = atRiskRaw
    .map((c) => ({
      id: c.id,
      name: fullName(c.name, c.lastName),
      totalVisits: 0,
      lastVisitAt: c.lastVisitAt,
      daysSince: c.daysSinceLastVisit,
      progress: progressById.get(c.id)?.progress ?? "",
    }))
    .map((row) => ({ ...row, totalVisits: progressById.get(row.id)?.totalVisits ?? 0 }))
    .sort((a, b) => b.totalVisits - a.totalVisits || b.daysSince - a.daysSince)

  // ── Actionable count ──────────────────────────────────────────────
  let actionable: ReportData["actionable"]
  if (programType === "points") {
    const res = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM loyalty.clients c
      WHERE c.tenant_id = ${tenantId} AND c.status <> 'blocked'
        AND c.points_balance >= COALESCE((SELECT MIN(points_cost) FROM loyalty.reward_catalog rc WHERE rc.tenant_id = ${tenantId} AND rc.active = true), 2147483647)`)
    actionable = { label: "Clientes con saldo para canjear", count: Number(res.rows[0]?.n ?? 0) }
  } else {
    const res = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM loyalty.rewards r WHERE r.tenant_id = ${tenantId} AND r.status = 'pending'`)
    actionable = { label: "Premios pendientes de canje", count: Number(res.rows[0]?.n ?? 0) }
  }

  // ── Birthdays in the coming period ────────────────────────────────
  const automations = (tenant.automations ?? {}) as {
    birthday?: { enabled?: boolean; sendHour?: number }
  }
  const birthdayEnabled = Boolean(automations.birthday?.enabled)
  const birthdayHour = automations.birthday?.sendHour ?? 10
  const horizon = kind === "weekly" ? 7 : daysInMonth(...ymParts(addDays(period.end, 1)))
  const upcoming = await upcomingBirthdays(tenantId, period.end, horizon)
  const birthdays: BirthdayRow[] = upcoming.map((b) => ({
    name: fullName(b.name, b.lastName),
    date: b.date,
    weekday: weekdayName(b.date),
    autoPush: birthdayEnabled
      ? `Programado ${String(birthdayHour).padStart(2, "0")}:00`
      : "Desactivado",
  }))

  // ── Monthly extras ────────────────────────────────────────────────
  let monthly: ReportData["monthly"] = null
  if (kind === "monthly") {
    const weeks = weeksOf(daily)
    const lastYear = sameMonthLastYear(period)
    const lyRes = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${within("v.created_at", lastYear)}`)
    const anyLastYear = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${local("v.created_at")} < ${period.start}::date - interval '11 months'`)
    const lastYearVisits =
      Number(anyLastYear.rows[0]?.n ?? 0) > 0 ? Number(lyRes.rows[0]?.n ?? 0) : null
    const cumulative = await computeCumulative({
      tenantId,
      tz,
      tzLit,
      since: await firstActivityDate(tenantId, tenant.created_at, tz),
      until: period,
      programType,
      stampsTarget,
      thresholds,
    })
    monthly = { weeks, lastYearVisits, cumulative }
  }

  const compareLabel = kind === "weekly" ? "la semana anterior" : "el mes anterior"
  const topClients = clientRows.slice(0, 3)

  return {
    kind,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      timezone: tz,
      programType,
      stampsTarget,
    },
    period,
    previous,
    periodLabel: periodLabel(kind, period),
    compareLabel,
    kpis: {
      visits: kpi(cur.visits, prev.visits),
      uniqueClients: kpi(cur.uniqueClients, prev.uniqueClients),
      newClients: kpi(cur.newClients, prev.newClients),
      rewardsRedeemed: kpi(cur.redeemed, prev.redeemed),
    },
    daily,
    bestDay,
    worstDay,
    repeatClients,
    campaigns: campaignRows,
    clients: clientRows,
    topClients,
    atRisk,
    actionable,
    birthdays,
    birthdayAutomationEnabled: birthdayEnabled,
    monthly,
  }
}

/** The all-time picture up to the end of `until`, also used by the on-demand export. */
export async function computeCumulative(params: {
  tenantId: string
  tz: string
  tzLit: ReturnType<typeof tenantTzLiteral>
  since: string
  until: Period
  programType: ProgramType
  stampsTarget: number | null
  thresholds: SegmentationThresholds
}): Promise<Cumulative> {
  const { tenantId, tzLit, since, until, programType, stampsTarget, thresholds } = params
  const local = (col: string) => sql`(${sql.raw(col)} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
  const upTo = (col: string) => sql`${local(col)} < (${until.end}::date + 1)`

  const redeemedTotal =
    programType === "points"
      ? sql`(SELECT COUNT(*)::int FROM loyalty.points_transactions t WHERE t.tenant_id = ${tenantId} AND t.type = 'redeem' AND ${upTo("t.created_at")})`
      : sql`(SELECT COUNT(*)::int FROM loyalty.rewards r WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL AND ${upTo("r.redeemed_at")})`

  const totalsRes = await db.execute<{
    visits: number
    clients: number
    active_clients: number
    redeemed: number
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${upTo("v.created_at")}) AS visits,
      (SELECT COUNT(*)::int FROM loyalty.clients c WHERE c.tenant_id = ${tenantId} AND ${upTo("c.created_at")}) AS clients,
      (SELECT COUNT(DISTINCT v.client_id)::int FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${upTo("v.created_at")}) AS active_clients,
      ${redeemedTotal} AS redeemed`)
  const t = totalsRes.rows[0]
  const visits = Number(t?.visits ?? 0)
  const activeClients = Number(t?.active_clients ?? 0)

  const monthsRes = await db.execute<{ ym: string; visits: number }>(sql`
    SELECT to_char(${local("v.created_at")}, 'YYYY-MM') AS ym, COUNT(*)::int AS visits
    FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} AND ${upTo("v.created_at")} GROUP BY 1`)
  const newMonthsRes = await db.execute<{ ym: string; n: number }>(sql`
    SELECT to_char(${local("c.created_at")}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
    FROM loyalty.clients c WHERE c.tenant_id = ${tenantId} AND ${upTo("c.created_at")} GROUP BY 1`)
  const redMonthsRes =
    programType === "points"
      ? await db.execute<{ ym: string; n: number }>(sql`
          SELECT to_char(${local("t.created_at")}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
          FROM loyalty.points_transactions t WHERE t.tenant_id = ${tenantId} AND t.type = 'redeem' AND ${upTo("t.created_at")} GROUP BY 1`)
      : await db.execute<{ ym: string; n: number }>(sql`
          SELECT to_char(${local("r.redeemed_at")}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
          FROM loyalty.rewards r WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL AND ${upTo("r.redeemed_at")} GROUP BY 1`)
  const vm = new Map(monthsRes.rows.map((r) => [r.ym, Number(r.visits)]))
  const nm = new Map(newMonthsRes.rows.map((r) => [r.ym, Number(r.n)]))
  const rm = new Map(redMonthsRes.rows.map((r) => [r.ym, Number(r.n)]))
  const months: MonthRow[] = eachMonth(since, until.end).map((ym) => {
    const [y, m] = ym.split("-").map(Number)
    return {
      ym,
      label: `${monthName(m)} ${y}`,
      visits: vm.get(ym) ?? 0,
      newClients: nm.get(ym) ?? 0,
      rewardsRedeemed: rm.get(ym) ?? 0,
    }
  })
  const bestMonth = months.length ? months.reduce((a, b) => (b.visits > a.visits ? b : a)) : null

  const topRes = await db.execute<{
    id: string
    name: string
    last_name: string | null
    total_visits: number
    points_balance: number
    last_visit_at: string | null
    cycle_visits: number
  }>(sql`
    SELECT c.id, c.name, c.last_name, c.points_balance,
      (SELECT COUNT(*)::int FROM loyalty.visits v WHERE v.client_id = c.id AND ${upTo("v.created_at")}) AS total_visits,
      (SELECT MAX(v.created_at) FROM loyalty.visits v WHERE v.client_id = c.id AND ${upTo("v.created_at")}) AS last_visit_at,
      (SELECT COUNT(*)::int FROM loyalty.visits v3 WHERE v3.client_id = c.id AND v3.cycle_number = c.current_cycle) AS cycle_visits
    FROM loyalty.clients c
    WHERE c.tenant_id = ${tenantId} AND c.status <> 'blocked'
    ORDER BY total_visits DESC, c.name ASC LIMIT 20`)
  const topClients = topRes.rows
    .filter((r) => Number(r.total_visits) > 0)
    .map((r) => ({
      name: fullName(r.name, r.last_name),
      totalVisits: Number(r.total_visits),
      lastVisitAt: parseVisitDate(r.last_visit_at),
      progress: progressLabel(
        programType,
        Number(r.cycle_visits),
        stampsTarget,
        Number(r.points_balance),
      ),
    }))

  const segRes = await db.execute<{
    created_at: string
    total_visits: number
    last_visit_at: string | null
    avg_days: string | null
  }>(sql`
    SELECT c.created_at, c.total_visits, s.last_visit_at, s.avg_days
    FROM loyalty.clients c
    LEFT JOIN (
      SELECT v.client_id, MAX(v.created_at) AS last_visit_at,
        CASE WHEN COUNT(*) >= 2
          THEN EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(*) - 1, 0)
          ELSE NULL END AS avg_days
      FROM loyalty.visits v WHERE v.tenant_id = ${tenantId} GROUP BY v.client_id
    ) s ON s.client_id = c.id
    WHERE c.tenant_id = ${tenantId} AND c.status <> 'blocked'`)
  const tally = tallySegments(
    segRes.rows.map((r) => ({
      createdAt: new Date(r.created_at),
      totalVisits: Number(r.total_visits),
      lastVisitAt: r.last_visit_at,
      avgDaysBetweenVisits: r.avg_days,
    })),
    thresholds,
  )

  const [sy, sm] = since.split("-").map(Number)
  return {
    since,
    sinceLabel: `${monthName(sm)} de ${sy}`,
    totals: {
      visits,
      clients: Number(t?.clients ?? 0),
      activeClients,
      rewardsRedeemed: Number(t?.redeemed ?? 0),
      avgVisitsPerClient: activeClients > 0 ? Math.round((visits / activeClients) * 10) / 10 : 0,
    },
    months,
    bestMonth,
    topClients,
    segments: tally.segments.map((s) => ({
      label: SEGMENT_LABELS[s.segment as ClientSegment],
      count: s.count,
    })),
  }
}

/** Convenience for the on-demand export: the cumulative picture up to the end of "YYYY-MM". */
export async function computeCumulativeUntil(
  tenantId: string,
  ym: string,
): Promise<{
  tenant: ReportData["tenant"]
  until: Period
  cumulative: Cumulative
}> {
  const until = monthPeriod(ym)
  const data = await computeReport({
    tenantId,
    kind: "monthly",
    todayLocal: addDays(until.end, 1),
    period: until,
  })
  if (!data.monthly) throw new Error("monthly section missing")
  return { tenant: data.tenant, until, cumulative: data.monthly.cumulative }
}

// ── Helpers ─────────────────────────────────────────────────────────

type SqlHelper = (col: string) => ReturnType<typeof sql>
type WithinHelper = (col: string, p: Period) => ReturnType<typeof sql>

/** One row per day of the period, zero-filled, with the busiest local hour. */
async function dailyRows(params: {
  tenantId: string
  period: Period
  programType: ProgramType
  local: SqlHelper
  within: WithinHelper
}): Promise<DailyRow[]> {
  const { tenantId, period, programType, local, within } = params
  const dailyRes = await db.execute<{
    day: string
    visits: number
    unique_clients: number
  }>(sql`
    SELECT
      to_char(${local("v.created_at")}, 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS visits,
      COUNT(DISTINCT v.client_id)::int AS unique_clients
    FROM loyalty.visits v
    WHERE v.tenant_id = ${tenantId} AND ${within("v.created_at", period)}
    GROUP BY 1`)
  // Peak hour per day: busiest local hour (ties → earliest), picked in JS.
  const hourlyRes = await db.execute<{ day: string; hour: number; n: number }>(sql`
    SELECT
      to_char(${local("v.created_at")}, 'YYYY-MM-DD') AS day,
      EXTRACT(HOUR FROM ${local("v.created_at")})::int AS hour,
      COUNT(*)::int AS n
    FROM loyalty.visits v
    WHERE v.tenant_id = ${tenantId} AND ${within("v.created_at", period)}
    GROUP BY 1, 2`)
  const peakByDay = new Map<string, { hour: number; n: number }>()
  for (const r of hourlyRes.rows) {
    const cur = peakByDay.get(r.day)
    const n = Number(r.n)
    const hour = Number(r.hour)
    if (!cur || n > cur.n || (n === cur.n && hour < cur.hour)) peakByDay.set(r.day, { hour, n })
  }
  const newByDayRes = await db.execute<{ day: string; n: number }>(sql`
    SELECT to_char(${local("c.created_at")}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM loyalty.clients c WHERE c.tenant_id = ${tenantId} AND ${within("c.created_at", period)}
    GROUP BY 1`)
  const redeemedByDayRes =
    programType === "points"
      ? await db.execute<{ day: string; n: number }>(sql`
          SELECT to_char(${local("t.created_at")}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
          FROM loyalty.points_transactions t
          WHERE t.tenant_id = ${tenantId} AND t.type = 'redeem' AND ${within("t.created_at", period)}
          GROUP BY 1`)
      : await db.execute<{ day: string; n: number }>(sql`
          SELECT to_char(${local("r.redeemed_at")}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
          FROM loyalty.rewards r
          WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL
            AND ${within("r.redeemed_at", period)}
          GROUP BY 1`)

  const dailyMap = new Map(dailyRes.rows.map((r) => [r.day, r]))
  const newMap = new Map(newByDayRes.rows.map((r) => [r.day, Number(r.n)]))
  const redMap = new Map(redeemedByDayRes.rows.map((r) => [r.day, Number(r.n)]))
  const daily: DailyRow[] = eachDay(period.start, period.end).map((date) => {
    const r = dailyMap.get(date)
    return {
      date,
      weekday: weekdayName(date),
      visits: Number(r?.visits ?? 0),
      uniqueClients: Number(r?.unique_clients ?? 0),
      newClients: newMap.get(date) ?? 0,
      rewardsRedeemed: redMap.get(date) ?? 0,
      peakHour: peakByDay.has(date)
        ? `${String(peakByDay.get(date)?.hour).padStart(2, "0")}:00`
        : null,
    }
  })
  return daily
}

/** Earliest of: tenant creation, first client, first visit — so backfilled history is never cut off. */
async function firstActivityDate(
  tenantId: string,
  tenantCreatedAt: string,
  tz: string,
): Promise<string> {
  const res = await db.execute<{ first: string | null }>(sql`
    SELECT LEAST(
      (SELECT MIN(created_at) FROM loyalty.clients WHERE tenant_id = ${tenantId}),
      (SELECT MIN(created_at) FROM loyalty.visits WHERE tenant_id = ${tenantId}),
      ${tenantCreatedAt}::timestamp
    ) AS first`)
  const first = res.rows[0]?.first
  return toLocalDate(first ?? tenantCreatedAt, tz)
}

function ymParts(ymd: string): [number, number] {
  const [y, m] = ymd.split("-").map(Number)
  return [y, m]
}

async function progressFor(
  tenantId: string,
  ids: string[],
  programType: ProgramType,
  stampsTarget: number | null,
): Promise<Map<string, { progress: string; totalVisits: number }>> {
  const out = new Map<string, { progress: string; totalVisits: number }>()
  if (ids.length === 0) return out
  const res = await db.execute<{
    id: string
    total_visits: number
    points_balance: number
    cycle_visits: number
  }>(sql`
    SELECT c.id, c.total_visits, c.points_balance,
      (SELECT COUNT(*)::int FROM loyalty.visits v WHERE v.client_id = c.id AND v.cycle_number = c.current_cycle) AS cycle_visits
    FROM loyalty.clients c
    WHERE c.tenant_id = ${tenantId} AND c.id = ANY(${`{${ids.join(",")}}`}::uuid[])`)
  for (const r of res.rows) {
    out.set(r.id, {
      progress: progressLabel(
        programType,
        Number(r.cycle_visits),
        stampsTarget,
        Number(r.points_balance),
      ),
      totalVisits: Number(r.total_visits),
    })
  }
  return out
}

/** Split a month's daily rows into Monday-based weeks (first/last may be partial). */
export function weeksOf(daily: DailyRow[]): WeekRow[] {
  const weeks: WeekRow[] = []
  let current: WeekRow | null = null
  for (const d of daily) {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay()
    if (!current || dow === 1) {
      current = {
        label: "",
        start: d.date,
        end: d.date,
        visits: 0,
        newClients: 0,
        rewardsRedeemed: 0,
      }
      weeks.push(current)
    }
    current.end = d.date
    current.visits += d.visits
    current.newClients += d.newClients
    current.rewardsRedeemed += d.rewardsRedeemed
  }
  for (const [i, w] of weeks.entries()) {
    const a = Number(w.start.slice(8))
    const b = Number(w.end.slice(8))
    w.label = `Semana ${i + 1} (${a} al ${b})`
  }
  return weeks
}
