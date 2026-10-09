import { and, db, eq, promotions } from "@cuik/db"

import { computeLoyaltyFunnel } from "@/lib/analytics/compute-funnel"
import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

/**
 * GET /api/[tenant]/analytics/funnel
 * Lifetime loyalty funnel: registered → 1+ visit → 3+ visits → redeemed.
 * Not range/location scoped on purpose (see computeLoyaltyFunnel).
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError

    const [activePromotion] = await db
      .select({ type: promotions.type })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .limit(1)
    const data = await computeLoyaltyFunnel(
      tenant.id,
      activePromotion?.type === "points" ? "points" : "stamps",
    )
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/funnel]", error)
    return errorResponse("Internal server error", 500)
  }
}
