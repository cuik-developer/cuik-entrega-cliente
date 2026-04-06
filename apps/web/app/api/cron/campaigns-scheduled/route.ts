import { campaigns, db, sql } from "@cuik/db"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { executeCampaign } from "@/lib/campaigns"

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const cronSecret = request.headers.get("x-cron-secret")
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }

    // Find scheduled campaigns that are due
    const dueCampaigns = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(sql`${campaigns.status} = 'scheduled' AND ${campaigns.scheduledAt} <= NOW()`)

    const errors: string[] = []
    let processed = 0

    for (const campaign of dueCampaigns) {
      try {
        const result = await executeCampaign(campaign.id)
        processed++
        if (result.status === "failed") {
          errors.push(`Campaign ${campaign.id}: ${result.errors.join(", ")}`)
        }
      } catch (err) {
        errors.push(`Campaign ${campaign.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return successResponse({ processed, errors })
  } catch (error) {
    console.error("[POST /api/cron/campaigns-scheduled]", error)
    return errorResponse("Internal server error", 500)
  }
}
