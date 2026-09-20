import { analyticsQuerySchema } from "@cuik/shared/validators"

import { computePointsAnalytics } from "@/lib/analytics/compute-points"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

/**
 * GET /api/[tenant]/analytics/points?from&to&granularity&locationId
 * Points-program widgets: earned/redeemed KPIs with deltas, outstanding
 * balance, average ticket, earned-vs-redeemed series, top rewards, balance
 * distribution against the catalog and incentive cost.
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

    const url = new URL(request.url)
    const parsed = analyticsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return errorResponse("Invalid query parameters", 400, parsed.error.flatten())
    }

    const data = await computePointsAnalytics(tenant.id, {
      ...parsed.data,
      timezone: tenant.timezone,
    })
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/points]", error)
    return errorResponse("Internal server error", 500)
  }
}
