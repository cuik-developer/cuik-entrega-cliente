import { and, campaigns, clients, db, desc, eq, notifications } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

type Params = { params: Promise<{ tenant: string; id: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug, id: clientId } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Verify client exists and belongs to tenant
    const clientRows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)

    if (clientRows.length === 0) {
      return errorResponse("Client not found", 404)
    }

    const rows = await db
      .select({
        campaignName: campaigns.name,
        campaignMessage: campaigns.message,
        channel: notifications.channel,
        status: notifications.status,
        sentAt: notifications.sentAt,
        error: notifications.error,
      })
      .from(notifications)
      .innerJoin(campaigns, eq(notifications.campaignId, campaigns.id))
      .where(eq(notifications.clientId, clientId))
      .orderBy(desc(notifications.sentAt))

    return successResponse(rows)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]/communications]", error)
    return errorResponse("Internal server error", 500)
  }
}
