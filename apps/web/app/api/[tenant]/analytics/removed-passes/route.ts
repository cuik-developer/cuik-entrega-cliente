import { db, sql } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { APPLE_REMOVAL_TRACKING_SINCE } from "@/lib/wallet/pass-churn"
import { clientPassStateSql, removedFromStateSql } from "@/lib/wallet/removed-passes"

/** Max clients returned in the list (most recent removals first). */
const LIST_LIMIT = 200

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError

    // Clients whose pass is currently NOT installed anywhere and whose last
    // signal was a removal (Apple unregister since 0031, Google delete
    // callback). See lib/wallet/removed-passes.ts for the exact rule.
    const state = clientPassStateSql(sql`c."tenant_id" = ${tenant.id}`)

    const [countsRes, listRes] = await Promise.all([
      db.execute<{
        apple: number
        google: number
        apple_30d: number
        google_30d: number
      }>(sql`
        WITH s AS (${state}), r AS (${removedFromStateSql})
        SELECT
          count(*) FILTER (WHERE r."platform" = 'apple')::int AS "apple",
          count(*) FILTER (WHERE r."platform" = 'google')::int AS "google",
          count(*) FILTER (WHERE r."platform" = 'apple' AND r."removed_at" >= now() - interval '30 days')::int AS "apple_30d",
          count(*) FILTER (WHERE r."platform" = 'google' AND r."removed_at" >= now() - interval '30 days')::int AS "google_30d"
        FROM r
      `),
      db.execute<{
        id: string
        name: string
        last_name: string | null
        phone: string | null
        email: string | null
        platform: "apple" | "google"
        removed_at: Date | string
      }>(sql`
        WITH s AS (${state}), r AS (${removedFromStateSql})
        SELECT c."id", c."name", c."last_name", c."phone", c."email", r."platform", r."removed_at"
        FROM r
        JOIN loyalty.clients c ON c."id" = r."client_id"
        ORDER BY r."removed_at" DESC, c."id"
        LIMIT ${LIST_LIMIT}
      `),
    ])

    const c = countsRes.rows[0]
    return successResponse({
      appleTrackingSince: APPLE_REMOVAL_TRACKING_SINCE,
      total: { apple: Number(c?.apple ?? 0), google: Number(c?.google ?? 0) },
      last30: { apple: Number(c?.apple_30d ?? 0), google: Number(c?.google_30d ?? 0) },
      clients: listRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        lastName: r.last_name,
        phone: r.phone,
        email: r.email,
        platform: r.platform,
        removedAt: new Date(r.removed_at).toISOString(),
      })),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/removed-passes]", error)
    return errorResponse("Internal server error", 500)
  }
}
