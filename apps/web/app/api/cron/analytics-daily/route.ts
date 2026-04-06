import { db, sql, tenants, visitsDaily } from "@cuik/db"

import { errorResponse, successResponse } from "@/lib/api-utils"

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }

    // Calculate yesterday's date range
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split("T")[0]

    // Fetch all active/trial tenants
    const tenantRows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(sql`${tenants.status} IN ('active', 'trial')`)

    let processed = 0
    const errors: string[] = []

    for (const tenant of tenantRows) {
      try {
        // Aggregate yesterday's visits per location for this tenant
        const visitAgg = await db.execute(
          sql`
            SELECT
              COALESCE(v."location_id", '00000000-0000-0000-0000-000000000000') AS "locationId",
              COUNT(*)::int AS "totalVisits",
              COUNT(DISTINCT v."client_id")::int AS "uniqueClients",
              COUNT(DISTINCT v."client_id") FILTER (
                WHERE c."created_at"::date = ${yesterdayStr}::date
              )::int AS "newClients"
            FROM loyalty.visits v
            INNER JOIN loyalty.clients c ON c."id" = v."client_id"
            WHERE v."tenant_id" = ${tenant.id}
              AND v."created_at"::date = ${yesterdayStr}::date
            GROUP BY COALESCE(v."location_id", '00000000-0000-0000-0000-000000000000')
          `,
        )

        // Count rewards redeemed yesterday per location
        const rewardAgg = await db.execute(
          sql`
            SELECT
              COALESCE(v."location_id", '00000000-0000-0000-0000-000000000000') AS "locationId",
              COUNT(*)::int AS "rewardsRedeemed"
            FROM loyalty.rewards r
            LEFT JOIN loyalty.visits v
              ON v."client_id" = r."client_id"
              AND v."tenant_id" = r."tenant_id"
              AND v."created_at"::date = ${yesterdayStr}::date
            WHERE r."tenant_id" = ${tenant.id}
              AND r."redeemed_at"::date = ${yesterdayStr}::date
            GROUP BY COALESCE(v."location_id", '00000000-0000-0000-0000-000000000000')
          `,
        )

        type VisitAggRow = {
          locationId: string
          totalVisits: number
          uniqueClients: number
          newClients: number
        }
        type RewardAggRow = { locationId: string; rewardsRedeemed: number }

        const visitRows = visitAgg.rows as VisitAggRow[]
        const rewardRows = rewardAgg.rows as RewardAggRow[]

        // Build a map of locationId -> rewardsRedeemed
        const rewardMap = new Map<string, number>()
        for (const row of rewardRows) {
          rewardMap.set(row.locationId, row.rewardsRedeemed)
        }

        // Upsert into visits_daily for each location group
        for (const row of visitRows) {
          await db
            .insert(visitsDaily)
            .values({
              tenantId: tenant.id,
              date: yesterdayStr,
              locationId: row.locationId,
              totalVisits: row.totalVisits,
              uniqueClients: row.uniqueClients,
              newClients: row.newClients,
              rewardsRedeemed: rewardMap.get(row.locationId) ?? 0,
            })
            .onConflictDoUpdate({
              target: [visitsDaily.tenantId, visitsDaily.date, visitsDaily.locationId],
              set: {
                totalVisits: row.totalVisits,
                uniqueClients: row.uniqueClients,
                newClients: row.newClients,
                rewardsRedeemed: rewardMap.get(row.locationId) ?? 0,
              },
            })
        }

        processed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[CRON analytics-daily] tenant=${tenant.id} error:`, err)
        errors.push(`tenant=${tenant.id}: ${message}`)
      }
    }

    return successResponse({ processed, errors })
  } catch (error) {
    console.error("[POST /api/cron/analytics-daily]", error)
    return errorResponse("Internal server error", 500)
  }
}
