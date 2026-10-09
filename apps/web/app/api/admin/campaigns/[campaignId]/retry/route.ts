import { campaigns, db, eq, sql } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { executeCampaign } from "@/lib/campaigns"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/admin/campaigns/[campaignId]/retry
 * Re-runs a campaign that failed (draft with a send error) through the same
 * engine the cron uses; the atomic claim inside prevents a double send.
 */
export async function POST(
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
    const [c] = await db
      .select({
        status: campaigns.status,
        name: campaigns.name,
        tenantId: campaigns.tenantId,
        lastError: sql<string | null>`${campaigns.content} ->> 'lastError'`,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1)
    if (!c) return errorResponse("Campaign not found", 404)
    if (c.status !== "draft" || !c.lastError) {
      return errorResponse("Solo se reintentan campañas que fallaron", 400)
    }

    console.info(
      `[admin-retry] user=${session.user.id} tenant=${c.tenantId} campaign=${campaignId} "${c.name}"`,
    )
    const result = await executeCampaign(campaignId)
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/admin/campaigns/[campaignId]/retry]", error)
    return errorResponse("Internal server error", 500)
  }
}
