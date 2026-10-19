import { errorResponse, successResponse } from "@/lib/api-utils"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runDueReports } from "@/lib/reports/send-report"

/**
 * POST /api/cron/reports[?force=1]
 * Run hourly. For every active/trial tenant, sends the weekly / monthly report
 * by email when its configured local day and hour match. Idempotent per
 * period (tenants.automations.reports.<kind>.lastSentPeriod), so an extra run
 * never duplicates a report. `force=1` ignores the day/hour check (manual
 * runs); the per-period guard still applies.
 */
export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return errorResponse("Unauthorized", 401)
    }
    const force = new URL(request.url).searchParams.get("force") === "1"
    const result = await runDueReports({ force })
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/cron/reports]", error)
    return errorResponse("Internal server error", 500)
  }
}
