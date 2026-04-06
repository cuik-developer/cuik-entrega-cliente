import { and, campaigns, db, eq } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { executeCampaign } from "@/lib/campaigns"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Validate campaign exists and belongs to tenant
    const campaignRows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenant.id)))
      .limit(1)

    const campaign = campaignRows[0]
    if (!campaign) {
      return errorResponse("Campaign not found", 404)
    }

    // Validate status
    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      return errorResponse(`Campaign cannot be sent — current status is '${campaign.status}'`, 400)
    }

    const result = await executeCampaign(id)

    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/[tenant]/campaigns/[id]/send]", error)
    return errorResponse("Internal server error", 500)
  }
}
