import { db, sql, tenants } from "@cuik/db"
import { calculateRetentionCohorts } from "@/lib/analytics"
import { errorResponse, successResponse } from "@/lib/api-utils"

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }

    // Fetch all active/trial tenants
    const tenantRows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(sql`${tenants.status} IN ('active', 'trial')`)

    let processed = 0
    const errors: string[] = []

    for (const tenant of tenantRows) {
      try {
        await calculateRetentionCohorts(tenant.id)
        processed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[CRON analytics-retention] tenant=${tenant.id} error:`, err)
        errors.push(`tenant=${tenant.id}: ${message}`)
      }
    }

    return successResponse({ processed, errors })
  } catch (error) {
    console.error("[POST /api/cron/analytics-retention]", error)
    return errorResponse("Internal server error", 500)
  }
}
