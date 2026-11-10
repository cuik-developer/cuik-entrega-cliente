import { errorResponse, successResponse } from "@/lib/api-utils"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runImpactReminders } from "@/lib/loyalty/impact/reminder"

/**
 * POST /api/cron/impact-reminders[?force=1]
 * Run once a day (9 AM Lima). The first five days of the month, every merchant
 * that has loaded sales before and has not loaded the previous month gets one
 * email asking for the file. Idempotent per month; `force=1` ignores the
 * day-of-month window (manual run).
 */
export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return errorResponse("Unauthorized", 401)
    const force = new URL(request.url).searchParams.get("force") === "1"
    return successResponse(await runImpactReminders({ force }))
  } catch (error) {
    console.error("[POST /api/cron/impact-reminders]", error)
    return errorResponse("Internal server error", 500)
  }
}
