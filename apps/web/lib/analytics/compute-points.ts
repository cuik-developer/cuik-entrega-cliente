import { db, sql } from "@cuik/db"
import type { PointsAnalytics, PointsSeriesRow, TopRewardRow } from "@cuik/shared/types/analytics"

import { tenantTzLiteral } from "./tenant-tz"

export type PointsAnalyticsParams = {
  from: string // YYYY-MM-DD (tenant-local)
  to: string
  granularity: "day" | "week" | "month"
  locationId?: string
  timezone: string | null | undefined
}

type Num = number | string | null | undefined
const n = (v: Num): number => (v === null || v === undefined ? 0 : Number(v))

/** Previous period of the same length, ending the day before `from`. */
function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T12:00:00Z`)
  const t = new Date(`${to}T12:00:00Z`)
  const days = Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1
  const prevTo = new Date(f.getTime() - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000)
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  return { from: ymd(prevFrom), to: ymd(prevTo) }
}

/**
 * Points-program analytics for a tenant and a tenant-local date range.
 *
 * - Movement (earned / redeemed) comes from loyalty.points_transactions.
 * - Earned points are attributed to a branch through the visit they belong to,
 *   so the branch filter applies to earn/ticket/bonus; redemptions and
 *   balances are tenant-wide (a client is not tied to one branch).
 * - Incentive breakdown (bonus / birthday) reads points_transactions.metadata
 *   written since sep-2026; older rows count as regular earnings.
 */
export async function computePointsAnalytics(
  tenantId: string,
  params: PointsAnalyticsParams,
): Promise<PointsAnalytics> {
  const tzLit = tenantTzLiteral(params.timezone)
  const { from, to, granularity, locationId } = params
  const prev = previousRange(from, to)

  const localTx = sql`(pt.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
  const localVisit = sql`(v.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
  const bucket =
    granularity === "week"
      ? sql`date_trunc('week', ${localTx})::date`
      : granularity === "month"
        ? sql`date_trunc('month', ${localTx})::date`
        : sql`(${localTx})::date`
  // Branch filter only makes sense for earn rows (through their visit).
  const locEarn = locationId ? sql`AND v.location_id = ${locationId}` : sql``
  const locVisit = locationId ? sql`AND v.location_id = ${locationId}` : sql``
  // With a branch filter, an earn row counts only if its visit matched the branch.
  const earnCond = locationId ? sql`v.id IS NOT NULL` : sql`true`

  const [
    movement,
    prevMovement,
    outstanding,
    ticket,
    series,
    topRewards,
    balances,
    incentives,
    funnel,
  ] = await Promise.all([
    // Earned / redeemed in range
    db.execute<{ earned: Num; redeemed: Num }>(sql`
        SELECT
          COALESCE(SUM(pt.amount) FILTER (WHERE pt.type = 'earn' AND ${earnCond}), 0)::int AS earned,
          COALESCE(SUM(-pt.amount) FILTER (WHERE pt.type = 'redeem'), 0)::int AS redeemed
        FROM loyalty.points_transactions pt
        LEFT JOIN loyalty.visits v ON v.id = pt.visit_id ${locEarn}
        WHERE pt.tenant_id = ${tenantId}
          AND (${localTx})::date >= ${from} AND (${localTx})::date <= ${to}
      `),
    db.execute<{ earned: Num; redeemed: Num }>(sql`
        SELECT
          COALESCE(SUM(pt.amount) FILTER (WHERE pt.type = 'earn' AND ${earnCond}), 0)::int AS earned,
          COALESCE(SUM(-pt.amount) FILTER (WHERE pt.type = 'redeem'), 0)::int AS redeemed
        FROM loyalty.points_transactions pt
        LEFT JOIN loyalty.visits v ON v.id = pt.visit_id ${locEarn}
        WHERE pt.tenant_id = ${tenantId}
          AND (${localTx})::date >= ${prev.from} AND (${localTx})::date <= ${prev.to}
      `),
    // Outstanding balance (liability) — active clients only
    db.execute<{ outstanding: Num; active_clients: Num }>(sql`
        SELECT COALESCE(SUM(points_balance), 0)::int AS outstanding, COUNT(*)::int AS active_clients
        FROM loyalty.clients
        WHERE tenant_id = ${tenantId} AND status <> 'blocked'
      `),
    // Average ticket over visits with a purchase amount
    db.execute<{ avg_ticket: Num; ticket_count: Num }>(sql`
        SELECT AVG(v.amount)::numeric(10,2) AS avg_ticket, COUNT(*)::int AS ticket_count
        FROM loyalty.visits v
        WHERE v.tenant_id = ${tenantId} AND v.amount IS NOT NULL AND v.amount > 0
          AND (${localVisit})::date >= ${from} AND (${localVisit})::date <= ${to}
          ${locVisit}
      `),
    // Earned vs redeemed over time
    db.execute<{ date: string; earned: Num; redeemed: Num }>(sql`
        SELECT
          to_char(${bucket}, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(pt.amount) FILTER (WHERE pt.type = 'earn' AND ${earnCond}), 0)::int AS earned,
          COALESCE(SUM(-pt.amount) FILTER (WHERE pt.type = 'redeem'), 0)::int AS redeemed
        FROM loyalty.points_transactions pt
        LEFT JOIN loyalty.visits v ON v.id = pt.visit_id ${locEarn}
        WHERE pt.tenant_id = ${tenantId}
          AND (${localTx})::date >= ${from} AND (${localTx})::date <= ${to}
        GROUP BY ${bucket}
        ORDER BY ${bucket}
      `),
    // Most redeemed rewards in range
    db.execute<{
      id: string
      name: string
      count: Num
      points: Num
      last_at: Date | string | null
    }>(sql`
        SELECT rc.id, rc.name, COUNT(*)::int AS count, COALESCE(SUM(-pt.amount), 0)::int AS points,
               MAX(pt.created_at) AS last_at
        FROM loyalty.points_transactions pt
        JOIN loyalty.reward_catalog rc ON rc.id = pt.catalog_item_id
        WHERE pt.tenant_id = ${tenantId} AND pt.type = 'redeem'
          AND (${localTx})::date >= ${from} AND (${localTx})::date <= ${to}
        GROUP BY rc.id, rc.name
        ORDER BY count DESC, points DESC
        LIMIT 10
      `),
    // Balance distribution against the active catalog
    db.execute<{
      cheapest: Num
      most_expensive: Num
      below_cheapest: Num
      can_cheapest: Num
      can_most_expensive: Num
    }>(sql`
        WITH cat AS (
          SELECT MIN(points_cost) AS cheapest, MAX(points_cost) AS most_expensive
          FROM loyalty.reward_catalog WHERE tenant_id = ${tenantId} AND active = true
        )
        SELECT
          cat.cheapest, cat.most_expensive,
          COUNT(c.id) FILTER (WHERE cat.cheapest IS NULL OR c.points_balance < cat.cheapest)::int AS below_cheapest,
          COUNT(c.id) FILTER (WHERE cat.cheapest IS NOT NULL AND c.points_balance >= cat.cheapest)::int AS can_cheapest,
          COUNT(c.id) FILTER (WHERE cat.most_expensive IS NOT NULL AND c.points_balance >= cat.most_expensive)::int AS can_most_expensive
        FROM cat LEFT JOIN loyalty.clients c ON c.tenant_id = ${tenantId} AND c.status <> 'blocked'
        GROUP BY cat.cheapest, cat.most_expensive
      `),
    // Incentives: opt-in bonus (bonus visits) and birthday extra. Rows written
    // since sep-2026 carry basePoints in metadata; older rows fall back to
    // "visit on the client's birthday" and the promotion's points-per-currency.
    db.execute<{ bonus_points: Num; birthday_extra: Num }>(sql`
        WITH promo AS (
          SELECT COALESCE((config->'points'->>'pointsPerCurrency')::numeric, 1) AS ppc
          FROM loyalty.promotions
          WHERE tenant_id = ${tenantId} AND active = true AND type = 'points'
          ORDER BY created_at DESC LIMIT 1
        )
        SELECT
          COALESCE(SUM(pt.amount) FILTER (WHERE v.source = 'bonus'), 0)::int AS bonus_points,
          COALESCE(SUM(
            CASE
              WHEN pt.metadata ? 'bonusReasons' AND (pt.metadata->>'basePoints') ~ '^[0-9]+$'
                THEN CASE WHEN pt.metadata->'bonusReasons' @> '["birthday_multiplier"]'::jsonb
                          THEN pt.amount - (pt.metadata->>'basePoints')::int ELSE 0 END
              WHEN c.birthday IS NOT NULL AND v.amount IS NOT NULL
                   AND to_char(c.birthday, 'MM-DD') = to_char((${localVisit})::date, 'MM-DD')
                THEN GREATEST(pt.amount - FLOOR(v.amount * (SELECT ppc FROM promo))::int, 0)
              ELSE 0
            END
          ), 0)::int AS birthday_extra
        FROM loyalty.points_transactions pt
        LEFT JOIN loyalty.visits v ON v.id = pt.visit_id
        LEFT JOIN loyalty.clients c ON c.id = pt.client_id
        WHERE pt.tenant_id = ${tenantId} AND pt.type = 'earn'
          AND (${localTx})::date >= ${from} AND (${localTx})::date <= ${to}
          ${locEarn}
      `),
    // Lifetime: clients that redeemed points at least once
    db.execute<{ redeemers: Num }>(sql`
        SELECT COUNT(DISTINCT pt.client_id)::int AS redeemers
        FROM loyalty.points_transactions pt
        JOIN loyalty.clients c ON c.id = pt.client_id
        WHERE pt.tenant_id = ${tenantId} AND pt.type = 'redeem' AND c.status <> 'blocked'
      `),
  ])

  const m = movement.rows[0]
  const pm = prevMovement.rows[0]
  const o = outstanding.rows[0]
  const t = ticket.rows[0]
  const b = balances.rows[0]
  const inc = incentives.rows[0]

  const seriesRows: PointsSeriesRow[] = series.rows.map((r) => ({
    date: r.date,
    earned: n(r.earned),
    redeemed: n(r.redeemed),
  }))
  const rewards: TopRewardRow[] = topRewards.rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: n(r.count),
    points: n(r.points),
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
  }))

  return {
    kpis: {
      earned: n(m?.earned),
      earnedPrev: n(pm?.earned),
      redeemed: n(m?.redeemed),
      redeemedPrev: n(pm?.redeemed),
      outstanding: n(o?.outstanding),
      avgTicket:
        t?.avg_ticket === null || t?.avg_ticket === undefined ? null : Number(t.avg_ticket),
      ticketCount: n(t?.ticket_count),
    },
    series: seriesRows,
    topRewards: rewards,
    balances: {
      activeClients: n(o?.active_clients),
      cheapestCost: b?.cheapest === null || b?.cheapest === undefined ? null : n(b.cheapest),
      mostExpensiveCost:
        b?.most_expensive === null || b?.most_expensive === undefined ? null : n(b.most_expensive),
      belowCheapest: n(b?.below_cheapest),
      canRedeemCheapest: n(b?.can_cheapest),
      canRedeemMostExpensive: n(b?.can_most_expensive),
    },
    incentives: {
      bonusPoints: n(inc?.bonus_points),
      birthdayExtraPoints: n(inc?.birthday_extra),
    },
    redeemers: n(funnel.rows[0]?.redeemers),
  }
}
