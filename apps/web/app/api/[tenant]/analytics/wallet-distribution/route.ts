import { db, sql } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Count clients by ACTUAL wallet usage:
    // - Apple: confirmed via apple_devices table (device registered via Web Service Protocol)
    // - Google: has google_save_url but NO apple device (proxy — Google doesn't have a callback)
    // - Sin wallet: no apple device AND no google_save_url
    // Note: a client with both an apple device AND a google_save_url is counted in Apple only
    // (we can't confirm Google was actually used)
    const result = await db.execute(
      sql`
        WITH client_wallets AS (
          SELECT
            c."id" AS "client_id",
            EXISTS (
              SELECT 1 FROM passes.apple_devices ad
              INNER JOIN passes.pass_instances pi2 ON pi2."serial_number" = ad."serial_number"
              WHERE pi2."client_id" = c."id"
            ) AS "has_apple_device",
            BOOL_OR(pi."google_save_url" IS NOT NULL) AS "has_google_url"
          FROM loyalty.clients c
          LEFT JOIN passes.pass_instances pi ON pi."client_id" = c."id"
          WHERE c."tenant_id" = ${tenant.id}
          GROUP BY c."id"
        )
        SELECT
          COALESCE(SUM(CASE WHEN "has_apple_device" THEN 1 ELSE 0 END), 0)::int AS "apple",
          COALESCE(SUM(CASE WHEN "has_google_url" AND NOT "has_apple_device" THEN 1 ELSE 0 END), 0)::int AS "google",
          COALESCE(SUM(CASE WHEN NOT "has_apple_device" AND NOT "has_google_url" THEN 1 ELSE 0 END), 0)::int AS "none"
        FROM client_wallets
      `,
    )

    const rows = result.rows as Array<{ apple: number; google: number; none: number }>
    const row = rows[0] ?? { apple: 0, google: 0, none: 0 }

    return successResponse({
      apple: row.apple,
      google: row.google,
      none: row.none,
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/wallet-distribution]", error)
    return errorResponse("Internal server error", 500)
  }
}
