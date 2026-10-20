import { adminCampaignDetail } from "@/lib/admin/campaign-admin"
import { redactCampaignDetailForStaff } from "@/lib/admin/staff-redact"
import {
  errorResponse,
  isStaffSession,
  requireAuth,
  requireSuperAdminOr,
  successResponse,
} from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/admin/campaigns/[campaignId] — one campaign with channel breakdown and failures. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = await requireSuperAdminOr(session, "campaigns")
    if (roleError) return roleError

    const { campaignId } = await params
    if (!UUID_RE.test(campaignId)) return errorResponse("Campaign not found", 404)
    const detail = await adminCampaignDetail(campaignId)
    if (!detail) return errorResponse("Campaign not found", 404)
    // Equipo Cuik "campaigns": no per-client failure list (personal data).
    return successResponse(isStaffSession(session) ? redactCampaignDetailForStaff(detail) : detail)
  } catch (error) {
    console.error("[GET /api/admin/campaigns/[campaignId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
