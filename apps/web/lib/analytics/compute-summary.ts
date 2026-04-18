import { db, eq, sql, tenants } from "@cuik/db"
import type { AnalyticsSummary } from "@cuik/shared/types/analytics"

/**
 * Computes a KPI summary for a tenant within a date range.
 * Dates are interpreted in the tenant's timezone.
 */
export async function computeAnalyticsSummary(
  tenantId: string,
  opts?: { from?: string; to?: string },
): Promise<AnalyticsSummary> {
  // Fetch tenant timezone for correct date bucketing
  const tenantRows = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tz = tenantRows[0]?.timezone ?? "America/Lima"

  // Default "last 30 days" in tenant timezone (YYYY-MM-DD)
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: tz }) // YYYY-MM-DD
  const thirtyAgoDate = new Date()
  thirtyAgoDate.setDate(thirtyAgoDate.getDate() - 30)
  const thirtyAgoLocal = thirtyAgoDate.toLocaleDateString("en-CA", { timeZone: tz })

  const fromDate = opts?.from ?? thirtyAgoLocal
  const toDate = opts?.to ?? todayLocal

  // Helper: compare visits.created_at as a tenant-local date
  // (${visits.created_at} AT TIME ZONE 'UTC' AT TIME ZONE tz)::date

  // 1. Count total visits and unique clients (tenant-local date range)
  const visitsAgg = await db.execute(
    sql`
      SELECT
        COUNT(*)::int AS "totalVisits",
        COUNT(DISTINCT "client_id")::int AS "uniqueClients"
      FROM loyalty.visits
      WHERE "tenant_id" = ${tenantId}
        AND ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date >= ${fromDate}::date
        AND ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date <= ${toDate}::date
    `,
  )

  const visitsRows = visitsAgg.rows as Array<{
    totalVisits: number
    uniqueClients: number
  }>
  const totalVisits = visitsRows[0]?.totalVisits ?? 0
  const uniqueClients = visitsRows[0]?.uniqueClients ?? 0

  // 2. Count new clients (created within the date range in tenant's local time)
  const newClientsResult = await db.execute(
    sql`
      SELECT COUNT(*)::int AS "newClients"
      FROM loyalty.clients
      WHERE "tenant_id" = ${tenantId}
        AND ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date >= ${fromDate}::date
        AND ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date <= ${toDate}::date
    `,
  )

  const newClientsRows = newClientsResult.rows as Array<{ newClients: number }>
  const newClients = newClientsRows[0]?.newClients ?? 0

  // 3. Count rewards redeemed (tenant-local date range)
  const rewardsAgg = await db.execute(
    sql`
      SELECT
        COUNT(*)::int AS "totalCreated",
        COUNT(*) FILTER (WHERE "status" = 'redeemed')::int AS "totalRedeemed"
      FROM loyalty.rewards
      WHERE "tenant_id" = ${tenantId}
        AND ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date >= ${fromDate}::date
        AND ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date <= ${toDate}::date
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

  // 5. Top clients by LIFETIME visit count (no date filter — intentional).
  // Users expect this widget to show their most loyal clients historically,
  // not just within the current date selector. Scoping this to the range
  // truncated the counts (a client with 10 visits showed 2 in the last-7d
  // view). Range-scoped metrics live in totalVisits/uniqueClients above.
  const topClientsResult = await db.execute(
    sql`
      SELECT
        c."id",
        c."name",
        c."last_name" AS "lastName",
        c."tier",
        COUNT(v."id")::int AS "visitCount"
      FROM loyalty.visits v
      INNER JOIN loyalty.clients c ON c."id" = v."client_id"
      WHERE v."tenant_id" = ${tenantId}
      GROUP BY c."id", c."name", c."last_name", c."tier"
      ORDER BY "visitCount" DESC
      LIMIT 10
    `,
  )

  const topClientRows = topClientsResult.rows as Array<{
    id: string
    name: string
    lastName: string | null
    tier: string | null
    visitCount: number
  }>
  const topClients = topClientRows.map((row) => ({
    id: row.id,
    name: [row.name, row.lastName].filter(Boolean).join(" "),
    tier: row.tier,
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
