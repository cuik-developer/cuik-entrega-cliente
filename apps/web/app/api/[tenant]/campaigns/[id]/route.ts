import { and, campaignSegments, campaigns, db, eq, notifications, sql } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { computeCampaignEffectiveness } from "@/lib/campaigns/campaign-effectiveness"

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

    // Load campaign
    const campaignRows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenant.id)))
      .limit(1)

    const campaign = campaignRows[0]
    if (!campaign) {
      return errorResponse("Campaign not found", 404)
    }

    // Load segment
    const segmentRows = await db
      .select()
      .from(campaignSegments)
      .where(eq(campaignSegments.campaignId, id))
      .limit(1)

    // Load notification stats
    const statsRows = await db
      .select({
        status: notifications.status,
        count: sql<number>`count(*)::int`,
      })
      .from(notifications)
      .where(eq(notifications.campaignId, id))
      .groupBy(notifications.status)

    const stats = {
      sent: 0,
      delivered: 0,
      failed: 0,
      total: 0,
    }

    for (const row of statsRows) {
      const count = row.count
      stats.total += count
      if (row.status === "sent") stats.sent += count
      if (row.status === "delivered") stats.delivered += count
      if (row.status === "failed") stats.failed += count
    }

    // Compute effectiveness for sent campaigns
    const effectiveness = campaign.status === "sent" ? await computeCampaignEffectiveness(id) : null

    return successResponse({
      ...campaign,
      segment: segmentRows[0] ?? null,
      stats,
      effectiveness,
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
