import { db, sql, tenants } from "@cuik/db"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { getBirthdayConfig, hourLocal, runBirthdayAutomation } from "@/lib/campaigns/birthday"

/**
 * POST /api/cron/campaigns-birthday[?force=1]
 * Run hourly. For every active/trial tenant with the birthday automation
 * enabled whose local hour equals the configured sendHour, creates and sends
 * today's birthday campaign (idempotent per local day — see
 * runBirthdayAutomation). `force=1` ignores the hour check, for manual runs.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }
    const force = new URL(request.url).searchParams.get("force") === "1"

    const tenantRows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        timezone: tenants.timezone,
        automations: tenants.automations,
      })
      .from(tenants)
      .where(sql`${tenants.status} IN ('active', 'trial')`)

    const sent: Array<{
      tenant: string
      campaignId: string
      targetCount: number
      sentCount: number
    }> = []
    const skipped: Array<{ tenant: string; reason: string }> = []
    const errors: string[] = []

    for (const tenant of tenantRows) {
      const config = getBirthdayConfig(tenant.automations)
      if (!config.enabled) continue
      const tz = tenant.timezone ?? "America/Lima"
      if (!force && hourLocal(tz) !== config.sendHour) {
        skipped.push({ tenant: tenant.slug, reason: "not_the_hour" })
        continue
      }
      try {
        const r = await runBirthdayAutomation({ tenantId: tenant.id, timezone: tz, config })
        if (r.status === "sent") {
          sent.push({
            tenant: tenant.slug,
            campaignId: r.campaignId,
            targetCount: r.targetCount,
            sentCount: r.sentCount,
          })
        } else {
          skipped.push({ tenant: tenant.slug, reason: r.reason })
        }
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).split("\n")[0]
        console.error(`[CRON campaigns-birthday] tenant=${tenant.id} error:`, err)
        errors.push(`tenant=${tenant.slug}: ${message}`)
      }
    }

    return successResponse({ sent, skipped, errors })
  } catch (error) {
    console.error("[POST /api/cron/campaigns-birthday]", error)
    return errorResponse("Internal server error", 500)
  }
}
