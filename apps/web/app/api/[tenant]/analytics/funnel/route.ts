import { computeLoyaltyFunnel } from "@/lib/analytics/compute-funnel"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

/**
 * GET /api/[tenant]/analytics/funnel
 * Lifetime loyalty funnel: registered → wallet → 1+ visit → 3+ visits → redeemed.
 * Not range/location scoped on purpose (see computeLoyaltyFunnel).
 */
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

    const data = await computeLoyaltyFunnel(tenant.id)
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/funnel]", error)
    return errorResponse("Internal server error", 500)
  }
}
