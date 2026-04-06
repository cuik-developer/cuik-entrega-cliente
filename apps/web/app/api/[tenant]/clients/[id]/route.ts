import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { getClientStatus } from "@/lib/loyalty"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Basic UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return errorResponse("Invalid client ID format", 400)
    }

    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)
    const status = await getClientStatus({ clientId: id, tenantId: tenant.id, thresholds })
    if (!status) {
      return errorResponse("Client not found", 404)
    }

    return successResponse(status)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
