import { sendBillingReminders } from "@/lib/admin/billing-reminders"
import { errorResponse, successResponse } from "@/lib/api-utils"

/**
 * POST /api/cron/billing-reminders[?force=1]
 * Run once a day (8 AM Lima). Emails every super-admin the invoices due in
 * 3 days and the ones already due without a record. Nothing to say → no
 * email, unless `force=1` (manual check).
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (!secret || secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }
    const force = new URL(request.url).searchParams.get("force") === "1"
    const result = await sendBillingReminders({ force })
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/cron/billing-reminders]", error)
    return errorResponse("Internal server error", 500)
  }
}
