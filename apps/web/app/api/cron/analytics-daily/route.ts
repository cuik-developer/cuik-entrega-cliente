import { db, sql, tenants } from "@cuik/db"

import { aggregateVisitsDaily, daysToAggregate } from "@/lib/analytics/aggregate-visits-daily"
import { errorResponse, successResponse } from "@/lib/api-utils"

const DEFAULT_DAYS = 3
const MAX_DAYS = 90

/**
 * POST /api/cron/analytics-daily[?days=N]
 * Recomputes analytics.visits_daily for every active/trial tenant for the last
 * N tenant-local days (default 3, max 90), excluding today. Run once a night.
 * Re-doing a few days each run is deliberate: a missed night is healed by the
 * next one, and `?days=90` backfills history after enabling the schedule.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }

    const daysParam = Number(new URL(request.url).searchParams.get("days") ?? DEFAULT_DAYS)
    const days = Number.isInteger(daysParam)
      ? Math.min(Math.max(daysParam, 1), MAX_DAYS)
      : DEFAULT_DAYS

    const tenantRows = await db
      .select({ id: tenants.id, timezone: tenants.timezone })
      .from(tenants)
      .where(sql`${tenants.status} IN ('active', 'trial')`)

    let processed = 0
    let rowsWritten = 0
    const errors: string[] = []

    for (const tenant of tenantRows) {
      try {
        const tz = tenant.timezone ?? "America/Lima"
        const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: tz })
        for (const date of daysToAggregate(todayLocal, days)) {
          const { rows } = await aggregateVisitsDaily({ tenantId: tenant.id, timezone: tz, date })
          rowsWritten += rows
        }
        processed++
      } catch (err) {
        // Full error (query + params) goes to the server log; the response gets
        // only the first line so the schedule log stays readable.
        const message = (err instanceof Error ? err.message : String(err)).split("\n")[0]
        console.error(`[CRON analytics-daily] tenant=${tenant.id} error:`, err)
        errors.push(`tenant=${tenant.id}: ${message}`)
      }
    }

    return successResponse({ processed, days, rowsWritten, errors })
  } catch (error) {
    console.error("[POST /api/cron/analytics-daily]", error)
    return errorResponse("Internal server error", 500)
  }
}
