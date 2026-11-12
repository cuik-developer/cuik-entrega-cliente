import { errorResponse, successResponse } from "@/lib/api-utils"
import { isCronAuthorized } from "@/lib/cron-auth"
import { attributeAll } from "@/lib/growth/results"
import { recomputeAll } from "@/lib/growth/store"

export const maxDuration = 300

/**
 * POST /api/cron/growth-nightly
 * Run once a day, early (6 AM Lima). For every tenant with Growth on:
 * recomputes each client's rhythm and preferences from the POS sales
 * (growth.client_stats) and who belongs to each audience and from which day
 * (growth.audience_members), then attributes yesterday's sales to confirmed
 * sends. Idempotent: running it twice gives the same tables.
 */
export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) return errorResponse("Unauthorized", 401)
    const recomputed = await recomputeAll()
    const attributed = await attributeAll()
    return successResponse({ recomputed, attributed })
  } catch (error) {
    console.error("[POST /api/cron/growth-nightly]", error)
    return errorResponse("Internal server error", 500)
  }
}
