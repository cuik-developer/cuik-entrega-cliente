import { adminCampaignDetail } from "@/lib/admin/campaign-admin"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/admin/campaigns/[campaignId] — one campaign with channel breakdown and failures. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { campaignId } = await params
    if (!UUID_RE.test(campaignId)) return errorResponse("Campaign not found", 404)
    const detail = await adminCampaignDetail(campaignId)
    if (!detail) return errorResponse("Campaign not found", 404)
    return successResponse(detail)
  } catch (error) {
    console.error("[GET /api/admin/campaigns/[campaignId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
