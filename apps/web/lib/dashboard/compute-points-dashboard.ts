import { and, db, eq, promotions, sql, tenants } from "@cuik/db"
import { pointsPromotionConfigSchema } from "@cuik/shared/validators"

import { tenantTzLiteral } from "@/lib/analytics/tenant-tz"
import { describeExpirationPolicy } from "@/lib/loyalty/expiration"
import { getPointsExpiryConfig } from "@/lib/loyalty/expire-points"
import type { DayKpi } from "./kpi-utils"

/**
 * Dashboard numbers for a POINTS program. A points merchant thinks in points
 * granted, points redeemed and who can already claim something — not in
 * stamps and cycles — so the home screen reads differently from the stamps
 * one (see compute-dashboard.ts for that).
 */

export type PointsDashboardKpis = {
  /** Points granted today (earn transactions). */
  pointsEarned: DayKpi
  /** Points spent today (redeem transactions, as a positive number). */
  pointsRedeemed: DayKpi
  /** Distinct clients who earned points today. */
  clientsEarned: DayKpi
  /** Redemptions today (one per catalog item handed over). */
  redemptions: DayKpi
}

export type PointsDashboardState = {
  /** Sum of every active client's balance. */
  inCirculation: number
  /** Clients whose balance reaches the cheapest catalog item; null cost = no catalog. */
  canRedeem: number
  cheapestCost: number | null
  /** Points (and holders) that expire within the next 7 days. */
  expiringSoon: { points: number; clients: number }
  /** Points expired since the 1st of the current local month. */
  expiredThisMonth: number
  /** Expiration policy label, null when points never expire. */
  policy: string | null
  /** Whether the merchant's "puntos por vencer" push is on. */
  warningEnabled: boolean
}

type CountRow = { today: number; previous: number }

function toKpi(row: CountRow | undefined): DayKpi {
  return { today: Number(row?.today ?? 0), previous: Number(row?.previous ?? 0) }
}

/** Today so far vs. the same weekday last week up to the same time of day, tenant time. */
export async function getPointsDashboardKpis(
  tenantId: string,
  timezone: string,
): Promise<PointsDashboardKpis> {
  const tzLit = tenantTzLiteral(timezone)
  const nowLocal = sql`(NOW() AT TIME ZONE ${tzLit})`
  const dayStart = sql`date_trunc('day', ${nowLocal})`
  const twoWeeksAgo = sql`${dayStart} - interval '7 days'`
  const ts = sql`(pt.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`

  const windows = (agg: string) => sql`
    COALESCE(${sql.raw(agg)} FILTER (WHERE ${ts} >= ${dayStart} AND ${ts} <= ${nowLocal}), 0)::int AS "today",
    COALESCE(${sql.raw(agg)} FILTER (WHERE ${ts} >= ${dayStart} - interval '7 days' AND ${ts} <= ${nowLocal} - interval '7 days'), 0)::int AS "previous"`

  const [earned, redeemed, clientsEarned, redemptions] = await Promise.all([
    db.execute(sql`
      SELECT ${windows("SUM(pt.amount)")}
      FROM loyalty.points_transactions pt
      WHERE pt.tenant_id = ${tenantId} AND pt.type = 'earn' AND ${ts} >= ${twoWeeksAgo}`),
    db.execute(sql`
      SELECT ${windows("SUM(-pt.amount)")}
      FROM loyalty.points_transactions pt
      WHERE pt.tenant_id = ${tenantId} AND pt.type = 'redeem' AND ${ts} >= ${twoWeeksAgo}`),
    db.execute(sql`
      SELECT ${windows("COUNT(DISTINCT pt.client_id)")}
      FROM loyalty.points_transactions pt
      WHERE pt.tenant_id = ${tenantId} AND pt.type = 'earn' AND ${ts} >= ${twoWeeksAgo}`),
    db.execute(sql`
      SELECT ${windows("COUNT(*)")}
      FROM loyalty.points_transactions pt
      WHERE pt.tenant_id = ${tenantId} AND pt.type = 'redeem' AND ${ts} >= ${twoWeeksAgo}`),
  ])

  return {
    pointsEarned: toKpi(earned.rows[0] as CountRow | undefined),
    pointsRedeemed: toKpi(redeemed.rows[0] as CountRow | undefined),
    clientsEarned: toKpi(clientsEarned.rows[0] as CountRow | undefined),
    redemptions: toKpi(redemptions.rows[0] as CountRow | undefined),
  }
}

/** Where the program stands right now (not a today-vs-last-week comparison). */
export async function getPointsDashboardState(
  tenantId: string,
  timezone: string,
): Promise<PointsDashboardState> {
  const tzLit = tenantTzLiteral(timezone)
  const monthStart = sql`date_trunc('month', (NOW() AT TIME ZONE ${tzLit}))`
  const localTx = sql`(pt.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`

  const [balances, expiring, expired, tenantRow, promoRow] = await Promise.all([
    db.execute<{
      in_circulation: number | string | null
      can_redeem: number | string | null
      cheapest: number | string | null
    }>(sql`
      WITH cat AS (
        SELECT MIN(points_cost) AS cheapest
        FROM loyalty.reward_catalog WHERE tenant_id = ${tenantId} AND active = true
      )
      SELECT
        COALESCE(SUM(c.points_balance), 0)::int AS in_circulation,
        COUNT(c.id) FILTER (WHERE cat.cheapest IS NOT NULL AND c.points_balance >= cat.cheapest)::int AS can_redeem,
        cat.cheapest
      FROM cat LEFT JOIN loyalty.clients c ON c.tenant_id = ${tenantId} AND c.status <> 'blocked'
      GROUP BY cat.cheapest`),
    db.execute<{ points: number | string | null; clients: number | string | null }>(sql`
      SELECT COALESCE(SUM(pt.remaining), 0)::int AS points, COUNT(DISTINCT pt.client_id)::int AS clients
      FROM loyalty.points_transactions pt
      WHERE pt.tenant_id = ${tenantId} AND pt.type = 'earn' AND pt.remaining > 0
        AND pt.expires_at IS NOT NULL AND pt.expires_at > NOW()
        AND pt.expires_at <= NOW() + interval '7 days'`),
    db.execute<{ points: number | string | null }>(sql`
      SELECT COALESCE(SUM(-pt.amount), 0)::int AS points
      FROM loyalty.points_transactions pt
      WHERE pt.tenant_id = ${tenantId} AND pt.type = 'expire' AND ${localTx} >= ${monthStart}`),
    db
      .select({ automations: tenants.automations })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select({ config: promotions.config })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenantId),
          eq(promotions.type, "points"),
          eq(promotions.active, true),
        ),
      )
      .limit(1),
  ])

  const b = balances.rows[0]
  const e = expiring.rows[0]
  const parsed = pointsPromotionConfigSchema.safeParse(promoRow[0]?.config ?? {})
  const policy =
    parsed.success && parsed.data.points.pointsExpiration.mode !== "never"
      ? describeExpirationPolicy(parsed.data.points.pointsExpiration)
      : null

  return {
    inCirculation: Number(b?.in_circulation ?? 0),
    canRedeem: Number(b?.can_redeem ?? 0),
    cheapestCost: b?.cheapest === null || b?.cheapest === undefined ? null : Number(b.cheapest),
    expiringSoon: { points: Number(e?.points ?? 0), clients: Number(e?.clients ?? 0) },
    expiredThisMonth: Number(expired.rows[0]?.points ?? 0),
    policy,
    warningEnabled: getPointsExpiryConfig(tenantRow[0]?.automations).enabled,
  }
}

/** Points granted per local day for the last 7 days ("YYYY-MM-DD" → points). */
export async function getPointsPerDay(
  tenantId: string,
  timezone: string,
): Promise<Map<string, number>> {
  const tzLit = tenantTzLiteral(timezone)
  const localDay = sql`(pt.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})::date`
  const rows = await db.execute<{ date: string; points: number | string }>(sql`
    SELECT to_char(${localDay}, 'YYYY-MM-DD') AS date, COALESCE(SUM(pt.amount), 0)::int AS points
    FROM loyalty.points_transactions pt
    WHERE pt.tenant_id = ${tenantId} AND pt.type = 'earn'
      AND ${localDay} >= (NOW() AT TIME ZONE ${tzLit})::date - interval '6 days'
    GROUP BY ${localDay}
    ORDER BY ${localDay}`)
  return new Map(rows.rows.map((r) => [r.date, Number(r.points)]))
}
