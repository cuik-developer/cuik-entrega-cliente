import { and, campaignSegments, campaigns, db, eq, notifications, sql } from "@cuik/db"
import { updateCampaignSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
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

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantAdmin(session, tenant.id)
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

const EDITABLE = new Set(["draft", "scheduled"])

/**
 * PATCH /api/[tenant]/campaigns/[id]
 * Edit a draft or scheduled campaign: name, message, type, segment and
 * schedule. `scheduledAt: null` turns a scheduled campaign back into a draft;
 * a date turns a draft into scheduled. Sent / sending campaigns are immutable.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError

    const parsed = updateCampaignSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }
    const patch = parsed.data

    const [existing] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenant.id)))
      .limit(1)
    if (!existing) return errorResponse("Campaign not found", 404)
    if (!EDITABLE.has(existing.status)) {
      return errorResponse("Solo se pueden editar campañas en borrador o programadas", 409)
    }

    const nextScheduledAt =
      patch.scheduledAt === undefined
        ? existing.scheduledAt
        : patch.scheduledAt === null
          ? null
          : new Date(patch.scheduledAt)

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(campaigns)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.message !== undefined ? { message: patch.message } : {}),
          scheduledAt: nextScheduledAt,
          status: nextScheduledAt ? "scheduled" : "draft",
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, id))
        .returning()

      if (patch.segment) {
        const segment = patch.segment
        const values = {
          segmentName: segment.clientIds?.length ? "lista" : (segment.preset ?? "custom"),
          filter: segment,
        }
        const [seg] = await tx
          .update(campaignSegments)
          .set(values)
          .where(eq(campaignSegments.campaignId, id))
          .returning({ id: campaignSegments.id })
        if (!seg) await tx.insert(campaignSegments).values({ campaignId: id, ...values })
      }
      return row
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[PATCH /api/[tenant]/campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * DELETE /api/[tenant]/campaigns/[id]
 * Removes a draft or scheduled campaign (they have no notifications yet).
 * Sent campaigns are history and cannot be deleted.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError

    const [existing] = await db
      .select({ id: campaigns.id, status: campaigns.status })
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenant.id)))
      .limit(1)
    if (!existing) return errorResponse("Campaign not found", 404)
    if (!EDITABLE.has(existing.status)) {
      return errorResponse("Solo se pueden eliminar campañas en borrador o programadas", 409)
    }

    await db.transaction(async (tx) => {
      await tx.delete(notifications).where(eq(notifications.campaignId, id))
      await tx.delete(campaignSegments).where(eq(campaignSegments.campaignId, id))
      await tx.delete(campaigns).where(eq(campaigns.id, id))
    })

    return successResponse({ id, deleted: true })
  } catch (error) {
    console.error("[DELETE /api/[tenant]/campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
