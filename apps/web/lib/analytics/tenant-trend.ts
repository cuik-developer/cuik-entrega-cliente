import { db, sql } from "@cuik/db"

import { tenantTzLiteral } from "./tenant-tz"
import { buildBuckets, fillSeries, rangeDays, type TrendGranularity } from "./trend-buckets"

export type TrendSeriesKey = "visits" | "newClients" | "redemptions" | "points"

export type TenantTrend = {
  range: { from: string; to: string; granularity: TrendGranularity; days: number }
  /** Bucket starts (YYYY-MM-DD, tenant-local), zero-filled and in order. */
  buckets: string[]
  series: {
    visits: number[]
    newClients: number[]
    /** Stamps rewards redeemed + points redemptions. */
    redemptions: number[]
    /** Points earned; `null` unless the active program is a points program. */
    points: number[] | null
  }
  totals: Record<TrendSeriesKey, number | null>
}

export type TenantTrendParams = {
  from: string
  to: string
  granularity: TrendGranularity
  /** Branch filter; applies to visits and points earned (through the visit). */
  locationId?: string
  timezone: string | null | undefined
}

type Num = number | string | null | undefined
const n = (v: Num): number => (v === null || v === undefined ? 0 : Number(v))

/**
 * Time series for the merchant "Tendencia" chart: visits, new clients,
 * redemptions and (points programs) points earned, bucketed by day / ISO
 * week / month in the tenant's timezone over a tenant-local date range.
 */
export async function computeTenantTrend(
  tenantId: string,
  params: TenantTrendParams,
): Promise<TenantTrend> {
  const { from, to, granularity, locationId } = params
  const tzLit = tenantTzLiteral(params.timezone)

  // Same expression in SELECT and GROUP BY (see tenant-tz.ts for why the tz is inlined).
  const local = (col: string) =>
    sql`(${sql.raw(col)} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})::date`
  const bucket = (col: string) =>
    granularity === "day"
      ? local(col)
      : sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${local(col)})::date`
  const inRange = (col: string) => sql`${local(col)} BETWEEN ${from}::date AND ${to}::date`
  const locVisit = locationId ? sql`AND v.location_id = ${locationId}` : sql``
  // Earned points belong to a branch through their visit; with a branch
  // filter, earn rows without a matching visit are dropped.
  const locEarn = locationId ? sql`AND v.location_id = ${locationId}` : sql``
  const earnJoin = locationId ? sql`JOIN loyalty.visits v ON v.id = pt.visit_id ${locEarn}` : sql``

  const [programRes, seriesRes] = await Promise.all([
    db.execute<{ type: string | null }>(sql`
      SELECT type FROM loyalty.promotions
      WHERE tenant_id = ${tenantId} AND active = true
      ORDER BY created_at DESC LIMIT 1
    `),
    db.execute<{ kind: string; day: string; cnt: Num }>(sql`
      SELECT 'visits' AS kind, to_char(${bucket("v.created_at")}, 'YYYY-MM-DD') AS day, count(*)::int AS cnt
        FROM loyalty.visits v
        WHERE v.tenant_id = ${tenantId} AND v.source <> 'bonus' AND ${inRange("v.created_at")} ${locVisit}
        GROUP BY 2
      UNION ALL
      SELECT 'newClients', to_char(${bucket("c.created_at")}, 'YYYY-MM-DD'), count(*)::int
        FROM loyalty.clients c
        WHERE c.tenant_id = ${tenantId} AND ${inRange("c.created_at")}
        GROUP BY 2
      UNION ALL
      SELECT 'redemptions_rewards', to_char(${bucket("r.redeemed_at")}, 'YYYY-MM-DD'), count(*)::int
        FROM loyalty.rewards r
        WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed' AND r.redeemed_at IS NOT NULL
          AND ${inRange("r.redeemed_at")}
        GROUP BY 2
      UNION ALL
      SELECT 'redemptions_points', to_char(${bucket("pt.created_at")}, 'YYYY-MM-DD'), count(*)::int
        FROM loyalty.points_transactions pt
        WHERE pt.tenant_id = ${tenantId} AND pt.type = 'redeem' AND ${inRange("pt.created_at")}
        GROUP BY 2
      UNION ALL
      SELECT 'points', to_char(${bucket("pt.created_at")}, 'YYYY-MM-DD'), coalesce(sum(pt.amount), 0)::int
        FROM loyalty.points_transactions pt ${earnJoin}
        WHERE pt.tenant_id = ${tenantId} AND pt.type = 'earn' AND ${inRange("pt.created_at")}
        GROUP BY 2
    `),
  ])

  const isPoints = programRes.rows[0]?.type === "points"
  // A points redemption writes BOTH a points_transactions 'redeem' row and a
  // rewards row (redeem-points.ts), so count one source per program, like the
  // funnel does: stamps → rewards, points → redeem transactions.
  const redemptionKind = isPoints ? "redemptions_points" : "redemptions_rewards"
  const buckets = buildBuckets(from, to, granularity)

  const rowsOf = (kind: string) =>
    seriesRes.rows.filter((r) => r.kind === kind).map((r) => ({ date: r.day, value: n(r.cnt) }))

  const visits = fillSeries(buckets, rowsOf("visits"))
  const newClients = fillSeries(buckets, rowsOf("newClients"))
  const redemptions = fillSeries(buckets, rowsOf(redemptionKind))
  const points = isPoints ? fillSeries(buckets, rowsOf("points")) : null
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

  return {
    range: { from, to, granularity, days: rangeDays(from, to) },
    buckets,
    series: { visits, newClients, redemptions, points },
    totals: {
      visits: sum(visits),
      newClients: sum(newClients),
      redemptions: sum(redemptions),
      points: points ? sum(points) : null,
    },
  }
}
