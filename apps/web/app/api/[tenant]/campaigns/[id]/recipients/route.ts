import { and, clients, db, eq, gte, notifications, sql, visits } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug, id: campaignId } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Get campaign sentAt for the 24h window
    const { campaigns } = await import("@cuik/db")
    const [campaign] = await db
      .select({ sentAt: campaigns.sentAt })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenant.id)))
      .limit(1)

    if (!campaign) {
      return errorResponse("Campaign not found", 404)
    }

    // Get all recipients with their visit status within 24h of campaign send
    const windowEnd = campaign.sentAt
      ? new Date(campaign.sentAt.getTime() + 24 * 60 * 60 * 1000)
      : null

    const recipients = await db
      .select({
        clientId: notifications.clientId,
        clientName: clients.name,
        clientLastName: clients.lastName,
        clientPhone: clients.phone,
        clientEmail: clients.email,
        notificationStatus: notifications.status,
        notificationSentAt: notifications.sentAt,
        visitId: visits.id,
        visitCreatedAt: visits.createdAt,
      })
      .from(notifications)
      .innerJoin(clients, eq(clients.id, notifications.clientId))
      .leftJoin(
        visits,
        campaign.sentAt && windowEnd
          ? and(
              eq(visits.clientId, notifications.clientId),
              eq(visits.tenantId, tenant.id),
              gte(visits.createdAt, campaign.sentAt),
              sql`${visits.createdAt} <= ${windowEnd}`,
            )
          : sql`false`,
      )
      .where(eq(notifications.campaignId, campaignId))
      .orderBy(clients.name)

    // Deduplicate by clientId (a client might have multiple visits in the window)
    const seen = new Set<string>()
    const dedupedRecipients = recipients.filter((r) => {
      if (seen.has(r.clientId)) return false
      seen.add(r.clientId)
      return true
    })

    return successResponse(
      dedupedRecipients.map((r) => ({
        clientId: r.clientId,
        name: r.clientName + (r.clientLastName ? ` ${r.clientLastName}` : ""),
        phone: r.clientPhone,
        email: r.clientEmail,
        status: r.notificationStatus,
        sentAt: r.notificationSentAt,
        visited: r.visitId !== null,
        visitedAt: r.visitCreatedAt,
      })),
    )
  } catch (error) {
    console.error("[GET /api/[tenant]/campaigns/[id]/recipients]", error)
    return errorResponse("Internal server error", 500)
  }
}
