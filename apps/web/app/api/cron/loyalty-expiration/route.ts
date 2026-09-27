import { and, db, eq, promotions, sql, tenants } from "@cuik/db"
import { pointsPromotionConfigSchema } from "@cuik/shared/validators"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { hourLocal } from "@/lib/campaigns/birthday"
import {
  expireDuePoints,
  getPointsExpiryConfig,
  runPointsExpirationWarning,
} from "@/lib/loyalty/expire-points"

/**
 * POST /api/cron/loyalty-expiration[?force=1]
 * Run hourly. For every active/trial tenant whose points promotion has an
 * expiration policy:
 *   1. drains the lots whose expiry has passed (any hour), and
 *   2. at the configured local hour, pushes the "about to expire" warning.
 * Tenants with policy "never" are skipped entirely. `force=1` ignores the
 * hour check of the warning, for manual runs.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (!secret || secret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }
    const force = new URL(request.url).searchParams.get("force") === "1"

    const rows = await db
      .select({
        tenantId: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        timezone: tenants.timezone,
        automations: tenants.automations,
        config: promotions.config,
      })
      .from(promotions)
      .innerJoin(tenants, eq(tenants.id, promotions.tenantId))
      .where(
        and(
          eq(promotions.type, "points"),
          eq(promotions.active, true),
          sql`${tenants.status} IN ('active', 'trial')`,
        ),
      )

    const expired: Array<{ tenant: string; clients: number; points: number }> = []
    const warned: Array<{ tenant: string; campaigns: number; sentCount: number }> = []
    const skipped: Array<{ tenant: string; reason: string }> = []
    const errors: string[] = []

    for (const row of rows) {
      const parsed = pointsPromotionConfigSchema.safeParse(row.config ?? {})
      if (!parsed.success) {
        errors.push(`${row.slug}: invalid config`)
        continue
      }
      const { pointsExpiration } = parsed.data.points
      const warning = getPointsExpiryConfig(row.automations)
      if (pointsExpiration.mode === "never") {
        skipped.push({ tenant: row.slug, reason: "no_expiration" })
        continue
      }
      const tz = row.timezone ?? "America/Lima"
      try {
        const r = await expireDuePoints({ tenantId: row.tenantId, tenantName: row.name })
        if (r.clients > 0) expired.push({ tenant: row.slug, clients: r.clients, points: r.points })
        errors.push(...r.errors.map((e) => `${row.slug}: ${e}`))

        if (warning.enabled && (force || hourLocal(tz) === warning.sendHour)) {
          const w = await runPointsExpirationWarning({
            tenantId: row.tenantId,
            tenantName: row.name,
            timezone: tz,
            config: warning,
          })
          if (w.status === "sent") {
            warned.push({ tenant: row.slug, campaigns: w.campaigns, sentCount: w.sentCount })
          } else {
            skipped.push({ tenant: row.slug, reason: `warning_${w.reason}` })
          }
        }
      } catch (err) {
        errors.push(`${row.slug}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return successResponse({ tenants: rows.length, expired, warned, skipped, errors })
  } catch (error) {
    console.error("[POST /api/cron/loyalty-expiration]", error)
    return errorResponse("Internal server error", 500)
  }
}
