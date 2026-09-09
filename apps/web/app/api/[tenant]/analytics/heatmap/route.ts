import { heatmapQuerySchema } from "@cuik/shared/validators"

import { computeVisitsHeatmap } from "@/lib/analytics/compute-heatmap"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

/**
 * GET /api/[tenant]/analytics/heatmap?from&to[&locationId]
 * Visits per ISO weekday × hour (tenant timezone) for the range.
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
    const parsed = heatmapQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return errorResponse("Invalid query parameters", 400, parsed.error.flatten())
    }

    const data = await computeVisitsHeatmap({
      tenantId: tenant.id,
      timezone: tenant.timezone,
      ...parsed.data,
    })
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/heatmap]", error)
    return errorResponse("Internal server error", 500)
  }
}
