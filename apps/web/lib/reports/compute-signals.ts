import { db, sql } from "@cuik/db"
import { automationsConfigSchema } from "@cuik/shared/validators"
import type { ClientSegment, SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { computeClientSegment, SEGMENT_LABELS } from "@/lib/loyalty/client-segments"
import { parseAvgDays, parseVisitDate } from "@/lib/loyalty/visit-stats"
import type { CampaignRow, DailyRow, ProgramType } from "./compute-report"
import type {
  CampaignLift,
  CohortRow,
  DepthKpis,
  HeatRow,
  ReportSignals,
  RewardRow,
  SegmentRow,
} from "./insights"
import {
  monthName,
  type Period,
  previousMonth,
  previousWeek,
  type ReportKind,
  weekdayName,
} from "./period"

/**
 * Extra aggregates the insight rules need beyond the report's core KPIs:
 * a multi-period baseline, new vs. returning visitors, rhythm changes,
 * campaign lift, points/stamps usage and (monthly) cohort retention.
 */

type SqlHelper = (col: string) => ReturnType<typeof sql>
type WithinHelper = (col: string, p: Period) => ReturnType<typeof sql>

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over the period's aggregates; splitting would repeat the SQL helpers
export async function computeSignals(params: {
  tenantId: string
  kind: ReportKind
  period: Period
  previous: Period
  programType: ProgramType
  automations: unknown
  daily: DailyRow[]
  campaigns: CampaignRow[]
  periodVisits: number
  /** Totals of the current and previous period (from computeReport). */
  current: { visits: number; uniqueClients: number }
  previousTotals: { visits: number; uniqueClients: number }
  /** Visits in the period per distinct visitor (for the frequency buckets). */
  visitsPerClient: number[]
  thresholds: SegmentationThresholds
  local: SqlHelper
  within: WithinHelper
  totalsFor: (p: Period) => Promise<{ visits: number; newClients: number; redeemed: number }>
}): Promise<ReportSignals> {
  const { tenantId, kind, period, previous, programType, daily, campaigns, local, within } = params
  const isWeekly = kind === "weekly"

  // ── Baseline: the 4 weeks / 3 months before this period ───────────
  const back = isWeekly ? 4 : 3
  const priorPeriods: Period[] = []
  let cursor = period
  for (let i = 0; i < back; i++) {
    cursor = isWeekly ? previousWeek(cursor) : previousMonth(cursor)
    priorPeriods.push(cursor)
  }
  const priorTotals = await Promise.all(priorPeriods.map((p) => params.totalsFor(p)))
  const withActivity = priorTotals.filter((t) => t.visits > 0 || t.newClients > 0)
  const baseline =
    withActivity.length >= 2
      ? {
          periods: withActivity.length,
          visits: Math.round(withActivity.reduce((s, t) => s + t.visits, 0) / withActivity.length),
          newClients: Math.round(
            withActivity.reduce((s, t) => s + t.newClients, 0) / withActivity.length,
          ),
          redeemed: Math.round(
            withActivity.reduce((s, t) => s + t.redeemed, 0) / withActivity.length,
          ),
        }
      : null

  // ── New vs. returning visitors, active clients, peak hours ────────
  const [mixRes, peakCur, peakPrev, dowPrev, activeRes, heatRes] = await Promise.all([
    db.execute<{ returning: number; first_timers: number }>(sql`
      WITH pv AS (
        SELECT DISTINCT v.client_id FROM loyalty.visits v
        WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", period)}
      )
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM loyalty.visits o
          WHERE o.client_id = pv.client_id AND o.source <> 'bonus' AND ${local("o.created_at")} < ${period.start}::date
        ))::int AS returning,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM loyalty.visits o
          WHERE o.client_id = pv.client_id AND o.source <> 'bonus' AND ${local("o.created_at")} < ${period.start}::date
        ))::int AS first_timers
      FROM pv`),
    db.execute<{ hour: number; n: number }>(sql`
      SELECT EXTRACT(HOUR FROM ${local("v.created_at")})::int AS hour, COUNT(*)::int AS n
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", period)}
      GROUP BY 1 ORDER BY n DESC, hour ASC LIMIT 1`),
    db.execute<{ hour: number; n: number }>(sql`
      SELECT EXTRACT(HOUR FROM ${local("v.created_at")})::int AS hour, COUNT(*)::int AS n
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", previous)}
      GROUP BY 1 ORDER BY n DESC, hour ASC LIMIT 1`),
    db.execute<{ day: string; n: number }>(sql`
      SELECT to_char(${local("v.created_at")}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", previous)}
      GROUP BY 1 ORDER BY n DESC, day ASC LIMIT 1`),
    db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM loyalty.clients c
      WHERE c.tenant_id = ${tenantId} AND c.status IN ('active', 'inactive')
        AND ${local("c.created_at")} < (${period.end}::date + 1)`),
    db.execute<{ dow: number; band: string; n: number }>(sql`
      SELECT EXTRACT(ISODOW FROM ${local("v.created_at")})::int AS dow,
        CASE WHEN EXTRACT(HOUR FROM ${local("v.created_at")}) < 12 THEN 'm'
             WHEN EXTRACT(HOUR FROM ${local("v.created_at")}) < 18 THEN 't'
             ELSE 'n' END AS band,
        COUNT(*)::int AS n
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${within("v.created_at", period)}
      GROUP BY 1, 2`),
  ])
  const HEAT_DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
  const heat: HeatRow[] = HEAT_DAYS.map((weekday) => ({
    weekday,
    morning: 0,
    afternoon: 0,
    evening: 0,
  }))
  for (const row of heatRes.rows) {
    const h = heat[Number(row.dow) - 1]
    if (!h) continue
    const n = Number(row.n)
    if (row.band === "m") h.morning += n
    else if (row.band === "t") h.afternoon += n
    else h.evening += n
  }
  const fmtHour = (h: number | undefined) =>
    h === undefined || h === null ? null : `${String(h).padStart(2, "0")}:00`
  const bestCur = daily.filter((d) => d.visits > 0).sort((a, b) => b.visits - a.visits)[0]
  const prevDay = dowPrev.rows[0]?.day

  // ── Campaign lift: visits in the 48 h after each push vs. expected ──
  const days = Math.max(1, daily.length)
  const expected = Math.round((params.periodVisits / days) * 2 * 10) / 10
  const campaignLift: CampaignLift[] = []
  for (const c of campaigns) {
    if (!c.sentAt) continue
    const res = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus'
        AND v.created_at >= ${c.sentAt.toISOString()}::timestamp
        AND v.created_at < ${c.sentAt.toISOString()}::timestamp + interval '48 hours'`)
    const visitsAfter = Number(res.rows[0]?.n ?? 0)
    // Who answered: recipients (notification sent/delivered) with a visit in the 48 h after it.
    const resp = await db.execute<{
      name: string
      last_name: string | null
      visited_at: string
      created_at: string
      total_visits: number
      last_visit_at: string | null
      avg_days: string | null
    }>(sql`
      SELECT c.name, c.last_name, MIN(v.created_at) AS visited_at, c.created_at, c.total_visits,
        s.last_visit_at, s.avg_days
      FROM campaigns.notifications n
      JOIN loyalty.clients c ON c.id = n.client_id AND c.status IN ('active', 'inactive')
      JOIN loyalty.visits v ON v.client_id = n.client_id AND v.source <> 'bonus'
        AND v.created_at >= COALESCE(n.sent_at, ${c.sentAt.toISOString()}::timestamp)
        AND v.created_at < COALESCE(n.sent_at, ${c.sentAt.toISOString()}::timestamp) + interval '48 hours'
      LEFT JOIN (
        SELECT v2.client_id, MAX(v2.created_at) AS last_visit_at,
          CASE WHEN COUNT(*) >= 2
            THEN EXTRACT(EPOCH FROM (MAX(v2.created_at) - MIN(v2.created_at))) / 86400.0 / NULLIF(COUNT(*) - 1, 0)
            ELSE NULL END AS avg_days
        FROM loyalty.visits v2 WHERE v2.tenant_id = ${tenantId} AND v2.source <> 'bonus' GROUP BY v2.client_id
      ) s ON s.client_id = c.id
      WHERE n.campaign_id = ${c.id} AND n.status IN ('sent', 'delivered')
      GROUP BY c.id, c.name, c.last_name, c.created_at, c.total_visits, s.last_visit_at, s.avg_days
      ORDER BY visited_at ASC`)
    const responders = resp.rows.map((row) => ({
      name: [row.name, row.last_name].filter(Boolean).join(" "),
      visitedAt: new Date(row.visited_at),
      segment:
        SEGMENT_LABELS[
          computeClientSegment(
            {
              createdAt: new Date(row.created_at),
              totalVisits: Number(row.total_visits),
              lastVisitAt: parseVisitDate(row.last_visit_at),
              avgDaysBetweenVisits: parseAvgDays(row.avg_days),
            },
            params.thresholds,
          )
        ],
    }))
    campaignLift.push({
      name: c.name,
      sentCount: c.sentCount,
      visitsAfter,
      expected,
      liftPct: expected > 0 ? Math.round(((visitsAfter - expected) / expected) * 100) : null,
      responders,
    })
  }

  // ── Program usage ─────────────────────────────────────────────────
  let points: ReportSignals["points"] = null
  let stamps: ReportSignals["stamps"] = null
  if (programType === "points") {
    const parsed = automationsConfigSchema.safeParse(params.automations ?? {})
    const warningEnabled = Boolean(parsed.success && parsed.data.pointsExpiry?.enabled)
    const [usage, expiring] = await Promise.all([
      db.execute<{ earned: number; redeemed: number; expired: number }>(sql`
        SELECT
          COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'earn'), 0)::int AS earned,
          COALESCE(SUM(-t.amount) FILTER (WHERE t.type = 'redeem'), 0)::int AS redeemed,
          COALESCE(SUM(-t.amount) FILTER (WHERE t.type = 'expire'), 0)::int AS expired
        FROM loyalty.points_transactions t
        WHERE t.tenant_id = ${tenantId} AND ${within("t.created_at", period)}`),
      db.execute<{ clients: number; points: number }>(sql`
        SELECT COUNT(DISTINCT t.client_id)::int AS clients, COALESCE(SUM(t.remaining), 0)::int AS points
        FROM loyalty.points_transactions t
        JOIN loyalty.clients c ON c.id = t.client_id AND c.status IN ('active', 'inactive')
        WHERE t.tenant_id = ${tenantId} AND t.type = 'earn' AND t.remaining > 0
          AND t.expires_at IS NOT NULL
          AND ${local("t.expires_at")} >= (${period.end}::date + 1)
          AND ${local("t.expires_at")} < (${period.end}::date + 8)`),
    ])
    const u = usage.rows[0]
    const e = expiring.rows[0]
    points = {
      earned: Number(u?.earned ?? 0),
      redeemed: Number(u?.redeemed ?? 0),
      expired: Number(u?.expired ?? 0),
      expiringNext: { clients: Number(e?.clients ?? 0), points: Number(e?.points ?? 0) },
      warningEnabled,
    }
  } else {
    const res = await db.execute<{ earned: number; pending: number }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM loyalty.rewards r WHERE r.tenant_id = ${tenantId} AND ${within("r.created_at", period)}) AS earned,
        (SELECT COUNT(*)::int FROM loyalty.rewards r
           JOIN loyalty.clients c ON c.id = r.client_id AND c.status IN ('active', 'inactive')
           WHERE r.tenant_id = ${tenantId} AND r.status = 'pending') AS pending`)
    stamps = {
      rewardsEarned: Number(res.rows[0]?.earned ?? 0),
      pendingTotal: Number(res.rows[0]?.pending ?? 0),
    }
  }

  // ── Monthly: cohorts of the two months before this one ────────────
  const cohorts: CohortRow[] = []
  if (!isWeekly) {
    let m = period
    for (let i = 0; i < 2; i++) {
      m = previousMonth(m)
      const res = await db.execute<{ registered: number; returned: number }>(sql`
        WITH cohort AS (
          SELECT c.id FROM loyalty.clients c
          WHERE c.tenant_id = ${tenantId} AND c.status IN ('active', 'inactive')
            AND ${within("c.created_at", m)}
        )
        SELECT
          (SELECT COUNT(*)::int FROM cohort) AS registered,
          (SELECT COUNT(*)::int FROM cohort k WHERE EXISTS (
             SELECT 1 FROM loyalty.visits v
             WHERE v.client_id = k.id AND v.source <> 'bonus'
               AND ${local("v.created_at")} > ${m.end}::date
               AND ${local("v.created_at")} < (${period.end}::date + 1))) AS returned`)
      const r = res.rows[0]
      const registered = Number(r?.registered ?? 0)
      const returned = Number(r?.returned ?? 0)
      const [y, mm] = m.start.split("-").map(Number)
      cohorts.push({
        ym: m.start.slice(0, 7),
        label: `${monthName(mm)} ${y}`,
        registered,
        returned,
        retentionPct: registered > 0 ? Math.round((returned / registered) * 100) : 0,
      })
    }
  }

  const [topRewards, segments] = await Promise.all([
    computeTopRewards({ tenantId, period, previous, programType, within }),
    computeSegmentShift({ tenantId, period, previous, local, thresholds: params.thresholds }),
  ])

  const depth = await computeDepth({
    tenantId,
    isWeekly,
    period,
    previous,
    programType,
    local,
    within,
    current: params.current,
    previousTotals: params.previousTotals,
    visitsPerClient: params.visitsPerClient,
  })

  return {
    depth,
    baseline,
    returningClients: Number(mixRes.rows[0]?.returning ?? 0),
    newVisitors: Number(mixRes.rows[0]?.first_timers ?? 0),
    peakHour: {
      current: fmtHour(peakCur.rows[0]?.hour),
      previous: fmtHour(peakPrev.rows[0]?.hour),
    },
    bestWeekday: {
      current: bestCur ? bestCur.weekday : null,
      previous: prevDay ? weekdayName(prevDay) : null,
    },
    campaignLift,
    heat,
    activeClients: Number(activeRes.rows[0]?.n ?? 0),
    points,
    stamps,
    cohorts,
    topRewards,
    segments,
  }
}

async function computeTopRewards(params: {
  tenantId: string
  period: Period
  previous: Period
  programType: ProgramType
  within: WithinHelper
}): Promise<RewardRow[]> {
  const { tenantId, period, previous, programType, within } = params
  if (programType === "points") {
    const q = (p: Period) => sql`
      SELECT COALESCE(rc.name, 'Premio eliminado') AS name, COUNT(*)::int AS n, COALESCE(SUM(-t.amount), 0)::int AS points
      FROM loyalty.points_transactions t
      LEFT JOIN loyalty.reward_catalog rc ON rc.id = t.catalog_item_id
      WHERE t.tenant_id = ${tenantId} AND t.type = 'redeem' AND ${within("t.created_at", p)}
      GROUP BY 1`
    const [cur, prev] = await Promise.all([
      db.execute<{ name: string; n: number; points: number }>(q(period)),
      db.execute<{ name: string; n: number; points: number }>(q(previous)),
    ])
    const prevBy = new Map(prev.rows.map((r) => [r.name, Number(r.n)]))
    const names = new Set([...cur.rows.map((r) => r.name), ...prev.rows.map((r) => r.name)])
    const curBy = new Map(cur.rows.map((r) => [r.name, r]))
    return [...names]
      .map((name) => ({
        name,
        redemptions: Number(curBy.get(name)?.n ?? 0),
        previousRedemptions: prevBy.get(name) ?? 0,
        points: Number(curBy.get(name)?.points ?? 0),
      }))
      .sort((a, b) => b.redemptions - a.redemptions || a.name.localeCompare(b.name))
  }
  const q = (p: Period) => sql`
    SELECT COALESCE(r.reward_type, 'Premio') AS name, COUNT(*)::int AS n
    FROM loyalty.rewards r
    WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL AND ${within("r.redeemed_at", p)}
    GROUP BY 1`
  const [cur, prev] = await Promise.all([
    db.execute<{ name: string; n: number }>(q(period)),
    db.execute<{ name: string; n: number }>(q(previous)),
  ])
  const prevBy = new Map(prev.rows.map((r) => [r.name, Number(r.n)]))
  const names = new Set([...cur.rows.map((r) => r.name), ...prev.rows.map((r) => r.name)])
  const curBy = new Map(cur.rows.map((r) => [r.name, Number(r.n)]))
  return [...names]
    .map((name) => ({
      name,
      redemptions: curBy.get(name) ?? 0,
      previousRedemptions: prevBy.get(name) ?? 0,
      points: null,
    }))
    .sort((a, b) => b.redemptions - a.redemptions || a.name.localeCompare(b.name))
}

const SEGMENT_ORDER: ClientSegment[] = [
  "nuevo",
  "frecuente",
  "regular",
  "esporadico",
  "one_time",
  "en_riesgo",
  "inactivo",
]

/** Segments "as of" the end of the period and of the previous one (derived, never stored). */
async function computeSegmentShift(params: {
  tenantId: string
  period: Period
  previous: Period
  local: SqlHelper
  thresholds: SegmentationThresholds
}): Promise<SegmentRow[]> {
  const { tenantId, local, thresholds } = params
  const asOf = async (p: Period): Promise<Map<ClientSegment, number>> => {
    const res = await db.execute<{
      created_at: string
      total_visits: number
      last_visit_at: string | null
      avg_days: string | null
    }>(sql`
      SELECT c.created_at,
        COALESCE(s.n, 0)::int AS total_visits, s.last_visit_at, s.avg_days
      FROM loyalty.clients c
      LEFT JOIN (
        SELECT v.client_id, COUNT(*) AS n, MAX(v.created_at) AS last_visit_at,
          CASE WHEN COUNT(*) >= 2
            THEN EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(*) - 1, 0)
            ELSE NULL END AS avg_days
        FROM loyalty.visits v
        WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${local("v.created_at")} < (${p.end}::date + 1)
        GROUP BY v.client_id
      ) s ON s.client_id = c.id
      WHERE c.tenant_id = ${tenantId} AND c.status IN ('active', 'inactive')
        AND ${local("c.created_at")} < (${p.end}::date + 1)`)
    // "now" = the last instant of the period's last day.
    const now = new Date(`${p.end}T23:59:59`)
    const tally = new Map<ClientSegment, number>()
    for (const r of res.rows) {
      const seg = computeClientSegment(
        {
          createdAt: new Date(r.created_at),
          totalVisits: Number(r.total_visits),
          lastVisitAt: parseVisitDate(r.last_visit_at),
          avgDaysBetweenVisits: parseAvgDays(r.avg_days),
        },
        thresholds,
        now,
      )
      tally.set(seg, (tally.get(seg) ?? 0) + 1)
    }
    return tally
  }
  const [cur, prev] = await Promise.all([asOf(params.period), asOf(params.previous)])
  return SEGMENT_ORDER.map((key) => ({
    key,
    label: SEGMENT_LABELS[key],
    count: cur.get(key) ?? 0,
    previous: prev.get(key) ?? 0,
  }))
}

function ratio(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) / 100 : 0
}

async function computeDepth(params: {
  tenantId: string
  isWeekly: boolean
  period: Period
  previous: Period
  programType: ProgramType
  local: SqlHelper
  within: WithinHelper
  current: { visits: number; uniqueClients: number }
  previousTotals: { visits: number; uniqueClients: number }
  visitsPerClient: number[]
}): Promise<DepthKpis> {
  const { tenantId, period, previous, programType, local, within } = params
  const upTo = sql`${local("v.created_at")} < (${period.end}::date + 1)`

  const firstRedeem =
    programType === "points"
      ? sql`SELECT t.client_id, MIN(t.created_at) AS first_at FROM loyalty.points_transactions t
            WHERE t.tenant_id = ${tenantId} AND t.type = 'redeem' GROUP BY t.client_id`
      : sql`SELECT r.client_id, MIN(r.redeemed_at) AS first_at FROM loyalty.rewards r
            WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL GROUP BY r.client_id`

  const [gapRes, secondRes, funnelRes, rewardRes, ticketCur, ticketPrev] = await Promise.all([
    db.execute<{ med: string | null }>(sql`
      WITH iv AS (
        SELECT v.created_at,
          v.created_at - LAG(v.created_at) OVER (PARTITION BY v.client_id ORDER BY v.created_at) AS gap
        FROM loyalty.visits v
        WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${upTo}
      )
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM iv.gap) / 86400.0) AS med
      FROM iv WHERE iv.gap IS NOT NULL AND ${within("iv.created_at", period)}`),
    db.execute<{ cohort: number; returned: number }>(sql`
      WITH f AS (
        SELECT v.client_id, MIN(v.created_at) AS first_at FROM loyalty.visits v
        WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' GROUP BY v.client_id
      )
      SELECT COUNT(*)::int AS cohort,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM loyalty.visits v2
          WHERE v2.client_id = f.client_id AND v2.source <> 'bonus'
            AND v2.created_at > f.first_at AND v2.created_at < f.first_at + interval '30 days'))::int AS returned
      FROM f
      WHERE ${local("f.first_at")} >= (${period.end}::date - 59) AND ${local("f.first_at")} <= (${period.end}::date - 30)`),
    db.execute<{
      registered: number
      with_pass: number
      with_visit: number
      repeaters: number
      redeemers: number
      new_registered: number
      new_with_pass: number
      new_with_visit: number
      new_repeaters: number
      new_redeemers: number
    }>(sql`
      WITH c AS (
        SELECT c.id, c.created_at,
          EXISTS (SELECT 1 FROM passes.pass_instances p WHERE p.client_id = c.id) AS has_pass,
          (SELECT COUNT(*) FROM loyalty.visits v WHERE v.client_id = c.id AND v.source <> 'bonus' AND ${upTo}) AS n_visits,
          EXISTS (SELECT 1 FROM (${firstRedeem}) fr WHERE fr.client_id = c.id AND ${local("fr.first_at")} < (${period.end}::date + 1)) AS has_redeem,
          ${within("c.created_at", period)} AS is_new
        FROM loyalty.clients c
        WHERE c.tenant_id = ${tenantId} AND c.status IN ('active', 'inactive')
          AND ${local("c.created_at")} < (${period.end}::date + 1)
      )
      SELECT
        COUNT(*)::int AS registered,
        COUNT(*) FILTER (WHERE has_pass)::int AS with_pass,
        COUNT(*) FILTER (WHERE n_visits >= 1)::int AS with_visit,
        COUNT(*) FILTER (WHERE n_visits >= 2)::int AS repeaters,
        COUNT(*) FILTER (WHERE has_redeem)::int AS redeemers,
        COUNT(*) FILTER (WHERE is_new)::int AS new_registered,
        COUNT(*) FILTER (WHERE has_pass AND is_new)::int AS new_with_pass,
        COUNT(*) FILTER (WHERE n_visits >= 1 AND is_new)::int AS new_with_visit,
        COUNT(*) FILTER (WHERE n_visits >= 2 AND is_new)::int AS new_repeaters,
        COUNT(*) FILTER (WHERE has_redeem AND is_new)::int AS new_redeemers
      FROM c`),
    db.execute<{ med: string | null; n: number }>(sql`
      WITH fr AS (${firstRedeem})
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fr.first_at - c.created_at)) / 86400.0) AS med,
        COUNT(*)::int AS n
      FROM fr JOIN loyalty.clients c ON c.id = fr.client_id
      WHERE ${local("fr.first_at")} < (${period.end}::date + 1)`),
    db.execute<{ avg: string | null; n: number }>(sql`
      SELECT AVG(v.amount) AS avg, COUNT(v.amount)::int AS n FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND v.amount IS NOT NULL AND ${within("v.created_at", period)}`),
    db.execute<{ avg: string | null }>(sql`
      SELECT AVG(v.amount) AS avg FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND v.amount IS NOT NULL AND ${within("v.created_at", previous)}`),
  ])

  // Realistic buckets: a pet shop or barbershop client rarely comes more than
  // a few times a week/month, so the top bucket stays low.
  const defs = params.isWeekly
    ? [
        { label: "1 visita", min: 1, max: 1 },
        { label: "2 visitas", min: 2, max: 2 },
        { label: "3 visitas", min: 3, max: 3 },
        { label: "4 o más", min: 4, max: Number.POSITIVE_INFINITY },
      ]
    : [
        { label: "1 visita", min: 1, max: 1 },
        { label: "2 visitas", min: 2, max: 2 },
        { label: "3 a 4 visitas", min: 3, max: 4 },
        { label: "5 o más", min: 5, max: Number.POSITIVE_INFINITY },
      ]
  const buckets = defs.map((b) => ({
    label: b.label,
    n: params.visitsPerClient.filter((n) => n >= b.min && n <= b.max).length,
  }))
  const f = funnelRes.rows[0]
  const sv = secondRes.rows[0]
  const cohort = Number(sv?.cohort ?? 0)
  const returned = Number(sv?.returned ?? 0)
  const med = gapRes.rows[0]?.med
  const rmed = rewardRes.rows[0]?.med
  const tc = ticketCur.rows[0]
  const tp = ticketPrev.rows[0]
  const round1 = (x: number) => Math.round(x * 10) / 10
  return {
    frequency: {
      current: ratio(params.current.visits, params.current.uniqueClients),
      previous: ratio(params.previousTotals.visits, params.previousTotals.uniqueClients),
    },
    medianDaysBetween: med != null ? round1(Number(med)) : null,
    secondVisit: { cohort, returned, pct: cohort > 0 ? Math.round((returned / cohort) * 100) : 0 },
    buckets,
    funnel: {
      registered: Number(f?.registered ?? 0),
      withPass: Number(f?.with_pass ?? 0),
      withVisit: Number(f?.with_visit ?? 0),
      repeaters: Number(f?.repeaters ?? 0),
      redeemers: Number(f?.redeemers ?? 0),
      newRegistered: Number(f?.new_registered ?? 0),
      newWithPass: Number(f?.new_with_pass ?? 0),
      newWithVisit: Number(f?.new_with_visit ?? 0),
      newRepeaters: Number(f?.new_repeaters ?? 0),
      newRedeemers: Number(f?.new_redeemers ?? 0),
    },
    timeToFirstReward: {
      medianDays: rmed != null ? Math.round(Number(rmed)) : null,
      clients: Number(rewardRes.rows[0]?.n ?? 0),
    },
    ticket: {
      current: tc?.avg != null ? Math.round(Number(tc.avg) * 100) / 100 : null,
      previous: tp?.avg != null ? Math.round(Number(tp.avg) * 100) / 100 : null,
      visitsWithAmount: Number(tc?.n ?? 0),
    },
  }
}
