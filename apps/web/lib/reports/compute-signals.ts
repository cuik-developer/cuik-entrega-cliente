import { db, sql } from "@cuik/db"
import { automationsConfigSchema } from "@cuik/shared/validators"
import type { CampaignRow, DailyRow, ProgramType } from "./compute-report"
import type { CampaignLift, CohortRow, ReportSignals } from "./insights"
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
  const [mixRes, peakCur, peakPrev, dowPrev, activeRes] = await Promise.all([
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
  ])
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
    campaignLift.push({
      name: c.name,
      sentCount: c.sentCount,
      visitsAfter,
      expected,
      liftPct: expected > 0 ? Math.round(((visitsAfter - expected) / expected) * 100) : null,
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

  return {
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
    activeClients: Number(activeRes.rows[0]?.n ?? 0),
    points,
    stamps,
    cohorts,
  }
}
