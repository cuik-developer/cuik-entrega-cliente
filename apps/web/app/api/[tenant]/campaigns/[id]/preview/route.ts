import { and, campaignSegments, campaigns, db, eq } from "@cuik/db"
import type { SegmentFilter } from "@cuik/shared/types/campaign"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { countSegment } from "@/lib/campaigns"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"

export async function GET(
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
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenant.id)))
      .limit(1)

    if (campaignRows.length === 0) {
      return errorResponse("Campaign not found", 404)
    }

    // Load segment filter
    const segmentRows = await db
      .select({ filter: campaignSegments.filter })
      .from(campaignSegments)
      .where(eq(campaignSegments.campaignId, id))
      .limit(1)

    const filter = (segmentRows[0]?.filter ?? { preset: "todos" }) as SegmentFilter

    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)
    const count = await countSegment(tenant.id, filter, thresholds)

    return successResponse({ count })
  } catch (error) {
    console.error("[GET /api/[tenant]/campaigns/[id]/preview]", error)
    return errorResponse("Internal server error", 500)
  }
}
