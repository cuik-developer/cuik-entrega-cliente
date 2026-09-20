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

    // Count clients by wallet platform.
    // - Apple: the pass is actually installed — an iPhone registered the serial
    //   in passes.apple_devices (Apple's web service callback). The pass URL
    //   alone is not a signal: every client gets one at registration.
    // - Google: has a "save to Google Wallet" link and no Apple device. Google
    //   has no install callback here, so this is the best available proxy.
    // - Sin wallet: neither.
    const result = await db.execute(
      sql`
        WITH client_wallets AS (
          SELECT
            c."id" AS "client_id",
            BOOL_OR(ad."serial_number" IS NOT NULL) AS "has_apple",
            BOOL_OR(pi."google_save_url" IS NOT NULL AND pi."google_save_url" <> '') AS "has_google"
          FROM loyalty.clients c
          LEFT JOIN passes.pass_instances pi ON pi."client_id" = c."id"
          LEFT JOIN passes.apple_devices ad ON ad."serial_number" = pi."serial_number"
          WHERE c."tenant_id" = ${tenant.id}
          GROUP BY c."id"
        )
        SELECT
          COALESCE(SUM(CASE WHEN "has_apple" THEN 1 ELSE 0 END), 0)::int AS "apple",
          COALESCE(SUM(CASE WHEN "has_google" AND NOT "has_apple" THEN 1 ELSE 0 END), 0)::int AS "google",
          COALESCE(SUM(CASE WHEN NOT "has_apple" AND NOT "has_google" THEN 1 ELSE 0 END), 0)::int AS "none"
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
