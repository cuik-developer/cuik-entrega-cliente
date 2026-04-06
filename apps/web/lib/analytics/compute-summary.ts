import { db, sql } from "@cuik/db"
import type { AnalyticsSummary } from "@cuik/shared/types/analytics"

/**
 * Computes a KPI summary for a tenant within a date range.
 * Uses the pre-aggregated visits_daily table for visit/client metrics.
 * Queries rewards table for redemption rate.
 * Queries clients table for top clients by visit count.
 */
export async function computeAnalyticsSummary(
  tenantId: string,
  opts?: { from?: string; to?: string },
): Promise<AnalyticsSummary> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const fromDate = opts?.from ?? thirtyDaysAgo.toISOString().split("T")[0]
  const toDate = opts?.to ?? now.toISOString().split("T")[0]

  // 1. Count total visits and unique/new clients from raw visits table
  //    (visits_daily is pre-aggregated but may not be populated when locationId is missing)
  const visitsAgg = await db.execute(
    sql`
      SELECT
        COUNT(*)::int AS "totalVisits",
        COUNT(DISTINCT "client_id")::int AS "uniqueClients"
      FROM loyalty.visits
      WHERE "tenant_id" = ${tenantId}
        AND "created_at" >= ${fromDate}::date
        AND "created_at" < (${toDate}::date + interval '1 day')
    `,
  )

  const visitsRows = visitsAgg.rows as Array<{
    totalVisits: number
    uniqueClients: number
  }>
  const totalVisits = visitsRows[0]?.totalVisits ?? 0
  const uniqueClients = visitsRows[0]?.uniqueClients ?? 0

  // 2. Count new clients (created within the date range) for this tenant
  const newClientsResult = await db.execute(
    sql`
      SELECT COUNT(*)::int AS "newClients"
      FROM loyalty.clients
      WHERE "tenant_id" = ${tenantId}
        AND "created_at" >= ${fromDate}::date
        AND "created_at" < (${toDate}::date + interval '1 day')
    `,
  )

  const newClientsRows = newClientsResult.rows as Array<{ newClients: number }>
  const newClients = newClientsRows[0]?.newClients ?? 0

  // 3. Count rewards redeemed from rewards table
  const rewardsAgg = await db.execute(
    sql`
      SELECT
        COUNT(*)::int AS "totalCreated",
        COUNT(*) FILTER (WHERE "status" = 'redeemed')::int AS "totalRedeemed"
      FROM loyalty.rewards
      WHERE "tenant_id" = ${tenantId}
        AND "created_at" >= ${fromDate}::date
        AND "created_at" < (${toDate}::date + interval '1 day')
    `,
  )

  const rewardsRows = rewardsAgg.rows as Array<{
    totalCreated: number
    totalRedeemed: number
  }>
  const totalCreated = rewardsRows[0]?.totalCreated ?? 0
  const totalRedeemed = rewardsRows[0]?.totalRedeemed ?? 0
  const redemptionRate =
    totalCreated > 0 ? Number(((totalRedeemed / totalCreated) * 100).toFixed(2)) : 0

  // 4. Average visits per client
  const avgVisitsPerClient =
    uniqueClients > 0 ? Number((totalVisits / uniqueClients).toFixed(2)) : 0

  // 5. Top clients by visit count in range
  const topClientsResult = await db.execute(
    sql`
      SELECT
        c."id",
        c."name",
        COUNT(v."id")::int AS "visitCount"
      FROM loyalty.visits v
      INNER JOIN loyalty.clients c ON c."id" = v."client_id"
      WHERE v."tenant_id" = ${tenantId}
        AND v."created_at" >= ${fromDate}::date
        AND v."created_at" < (${toDate}::date + interval '1 day')
      GROUP BY c."id", c."name"
      ORDER BY "visitCount" DESC
      LIMIT 10
    `,
  )

  const topClientRows = topClientsResult.rows as Array<{
    id: string
    name: string
    visitCount: number
  }>
  const topClients = topClientRows.map((row) => ({
    id: row.id,
    name: row.name,
    visitCount: row.visitCount,
  }))

  return {
    totalVisits,
    uniqueClients,
    newClients,
    rewardsRedeemed: totalRedeemed,
    redemptionRate,
    avgVisitsPerClient,
    topClients,
  }
}
