import { and, campaigns, clients, db, eq, member, rewards, sql, tenants, user } from "@cuik/db"
import { tenantTzLiteral } from "@/lib/analytics/tenant-tz"
import { getAtRiskClientCount } from "@/lib/loyalty/churn-detection"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"
import type { WeekKpi } from "./kpi-utils"

export type DashboardKpis = {
  visits: WeekKpi
  uniqueClients: WeekKpi
  newClients: WeekKpi
  rewardsRedeemed: WeekKpi
}

export type TodayItems = {
  atRiskClients: number
  rewardsExpiringSoon: number
  rewardsPending: number
  scheduledCampaigns: Array<{ id: string; name: string; scheduledAt: Date }>
  newClientsWithoutVisit: number
  idleCashiers: Array<{ name: string }>
}

type CountRow = { current: number; previous: number; today: number }

function toKpi(row: CountRow | undefined): WeekKpi {
  return {
    current: Number(row?.current ?? 0),
    previous: Number(row?.previous ?? 0),
    today: Number(row?.today ?? 0),
  }
}

/**
 * Week-to-date KPIs with a like-for-like comparison: this week from Monday
 * 00:00 up to now, against last week from Monday 00:00 up to the same weekday
 * and time of day. Comparing against last week's FULL days would make every
 * morning look like a collapse. All boundaries in the tenant's timezone.
 */
export async function getDashboardKpis(tenantId: string, timezone: string): Promise<DashboardKpis> {
  const tzLit = tenantTzLiteral(timezone)
  const nowLocal = sql`(NOW() AT TIME ZONE ${tzLit})`
  const weekStart = sql`date_trunc('week', ${nowLocal})` // ISO week → Monday 00:00
  const twoWeeksAgo = sql`${weekStart} - interval '7 days'`

  // Local-time version of a timestamp column; `col` is a fixed identifier.
  const local = (col: "v.created_at" | "c.created_at" | "r.redeemed_at") =>
    sql`(${sql.raw(col)} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`

  // The three windows, as one SELECT list. `agg` is COUNT(*) or COUNT(DISTINCT …).
  const windows = (agg: string, ts: ReturnType<typeof sql>) => sql`
    ${sql.raw(agg)} FILTER (WHERE ${ts} >= ${weekStart} AND ${ts} <= ${nowLocal})::int AS "current",
    ${sql.raw(agg)} FILTER (WHERE ${ts} >= ${weekStart} - interval '7 days' AND ${ts} <= ${nowLocal} - interval '7 days')::int AS "previous",
    ${sql.raw(agg)} FILTER (WHERE (${ts})::date = (${nowLocal})::date)::int AS "today"`

  const [visitsRes, uniqueRes, newRes, redeemedRes] = await Promise.all([
    db.execute(sql`
      SELECT ${windows("COUNT(*)", local("v.created_at"))}
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND ${local("v.created_at")} >= ${twoWeeksAgo}`),
    db.execute(sql`
      SELECT ${windows("COUNT(DISTINCT v.client_id)", local("v.created_at"))}
      FROM loyalty.visits v
      WHERE v.tenant_id = ${tenantId} AND ${local("v.created_at")} >= ${twoWeeksAgo}`),
    db.execute(sql`
      SELECT ${windows("COUNT(*)", local("c.created_at"))}
      FROM loyalty.clients c
      WHERE c.tenant_id = ${tenantId} AND ${local("c.created_at")} >= ${twoWeeksAgo}`),
    db.execute(sql`
      SELECT ${windows("COUNT(*)", local("r.redeemed_at"))}
      FROM loyalty.rewards r
      WHERE r.tenant_id = ${tenantId} AND r.status = 'redeemed'
        AND r.redeemed_at IS NOT NULL AND ${local("r.redeemed_at")} >= ${twoWeeksAgo}`),
  ])

  return {
    visits: toKpi(visitsRes.rows[0] as CountRow | undefined),
    uniqueClients: toKpi(uniqueRes.rows[0] as CountRow | undefined),
    newClients: toKpi(newRes.rows[0] as CountRow | undefined),
    rewardsRedeemed: toKpi(redeemedRes.rows[0] as CountRow | undefined),
  }
}

/**
 * The "Para hoy" block: things that call for an action today, each backed by
 * a screen where the action happens. Counts only — the block links out.
 */
export async function getTodayItems(params: {
  tenantId: string
  organizationId: string
}): Promise<TodayItems> {
  const { tenantId, organizationId } = params

  const tenantRow = await db
    .select({ businessType: tenants.businessType, segmentationConfig: tenants.segmentationConfig })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const thresholds = getThresholds(
    tenantRow[0]?.businessType,
    tenantRow[0]?.segmentationConfig as Partial<SegmentationThresholds> | null,
  )

  const [atRisk, rewardRows, scheduled, newNoVisit, cashiers] = await Promise.all([
    getAtRiskClientCount(tenantId, thresholds),

    db
      .select({
        pending: sql<number>`COUNT(*)::int`,
        expiringSoon: sql<number>`COUNT(*) FILTER (WHERE ${rewards.expiresAt} IS NOT NULL AND ${rewards.expiresAt} >= NOW() AND ${rewards.expiresAt} < NOW() + interval '7 days')::int`,
      })
      .from(rewards)
      .where(and(eq(rewards.tenantId, tenantId), eq(rewards.status, "pending"))),

    db
      .select({ id: campaigns.id, name: campaigns.name, scheduledAt: campaigns.scheduledAt })
      .from(campaigns)
      .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.status, "scheduled")))
      .orderBy(campaigns.scheduledAt)
      .limit(3),

    db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, tenantId),
          eq(clients.totalVisits, 0),
          sql`${clients.createdAt} >= NOW() - interval '7 days'`,
        ),
      ),

    // Non-owner team members with no registered visit in the last 7 days.
    db
      .select({ name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organizationId),
          sql`${member.role} <> 'owner'`,
          sql`NOT EXISTS (
            SELECT 1 FROM loyalty.visits v
            WHERE v.tenant_id = ${tenantId}
              AND v.registered_by = ${member.userId}
              AND v.created_at >= NOW() - interval '7 days'
          )`,
        ),
      )
      .orderBy(user.name)
      .limit(5),
  ])

  return {
    atRiskClients: atRisk,
    rewardsExpiringSoon: Number(rewardRows[0]?.expiringSoon ?? 0),
    rewardsPending: Number(rewardRows[0]?.pending ?? 0),
    scheduledCampaigns: scheduled
      .filter((c): c is typeof c & { scheduledAt: Date } => c.scheduledAt !== null)
      .map((c) => ({ id: c.id, name: c.name, scheduledAt: c.scheduledAt })),
    newClientsWithoutVisit: Number(newNoVisit[0]?.cnt ?? 0),
    idleCashiers: cashiers.map((c) => ({ name: c.name ?? "Sin nombre" })),
  }
}
