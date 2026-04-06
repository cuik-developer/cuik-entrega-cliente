import { and, campaignSegments, campaigns, db, desc, eq, sql } from "@cuik/db"
import { campaignListSchema, createCampaignSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  paginationMeta,
  parsePagination,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { computeBatchEffectiveness } from "@/lib/campaigns/campaign-effectiveness"

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const body = await request.json()
    const parsed = createCampaignSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const { name, type, message, segment, scheduledAt } = parsed.data

    const status = scheduledAt ? "scheduled" : "draft"

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: tenant.id,
        name,
        type,
        message,
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdBy: session.user.id,
      })
      .returning()

    // Insert segment filter
    await db.insert(campaignSegments).values({
      campaignId: campaign.id,
      segmentName: segment.preset ?? "custom",
      filter: segment,
    })

    return successResponse(campaign, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const url = new URL(request.url)
    const queryParsed = campaignListSchema.safeParse(Object.fromEntries(url.searchParams))
    if (!queryParsed.success) {
      return errorResponse("Invalid query parameters", 400, queryParsed.error.flatten())
    }

    const { page, limit, offset } = parsePagination(url.searchParams)
    const { status } = queryParsed.data

    const conditions = [eq(campaigns.tenantId, tenant.id)]
    if (status) {
      conditions.push(eq(campaigns.status, status))
    }

    // Count total
    const [{ cnt: total }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(and(...conditions))

    // Fetch campaigns
    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
        message: campaigns.message,
        scheduledAt: campaigns.scheduledAt,
        sentAt: campaigns.sentAt,
        targetCount: campaigns.targetCount,
        sentCount: campaigns.sentCount,
        deliveredCount: campaigns.deliveredCount,
        createdBy: campaigns.createdBy,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaigns)
      .where(and(...conditions))
      .orderBy(desc(campaigns.createdAt))
      .limit(limit)
      .offset(offset)

    // Compute effectiveness for sent campaigns (last 30 days only)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const sentCampaignIds = rows
      .filter((c) => c.status === "sent" && c.sentAt && new Date(String(c.sentAt)) >= thirtyDaysAgo)
      .map((c) => c.id)

    const effectivenessMap = await computeBatchEffectiveness(sentCampaignIds)

    const dataWithEffectiveness = rows.map((row) => ({
      ...row,
      effectiveness: effectivenessMap.get(row.id) ?? null,
    }))

    return successResponse({
      data: dataWithEffectiveness,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}
