import { computeSegmentDistribution } from "@/lib/analytics/compute-segments"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"

/**
 * GET /api/[tenant]/analytics/segments
 * Current split of the client base across behavioural segments, using the
 * tenant's own thresholds — the same numbers the Clientes filter chips produce.
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

    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)
    const data = await computeSegmentDistribution(tenant.id, thresholds)
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/segments]", error)
    return errorResponse("Internal server error", 500)
  }
}
