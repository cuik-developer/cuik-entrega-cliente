import { sendAdminDigest } from "@/lib/admin/admin-digest"
import { errorResponse, successResponse } from "@/lib/api-utils"

/**
 * POST /api/cron/admin-digest[?force=1]
 * Run once a day (8 AM Lima). Emails every super-admin the daily digest:
 * billing, cold tenants, demos ending, Apple certificates expiring and failed
 * campaigns. Nothing new to say → no email. `force=1` ignores the day marker
 * and the per-alert cadence (manual check: sends everything live).
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (!secret || secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }
    const force = new URL(request.url).searchParams.get("force") === "1"
    const result = await sendAdminDigest({ force })
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/cron/admin-digest]", error)
    return errorResponse("Internal server error", 500)
  }
}
