import { and, campaignSegments, campaigns, db, desc, eq, sql } from "@cuik/db"
import { campaignListSchema, createCampaignSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  paginationMeta,
  parsePagination,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { computeBatchEffectiveness } from "@/lib/campaigns/campaign-effectiveness"

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantAdmin(session, tenant.id)
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
      segmentName: segment.clientIds?.length ? "lista" : (segment.preset ?? "custom"),
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

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError

    const url = new URL(request.url)
    const queryParsed = campaignListSchema.safeParse(Object.fromEntries(url.searchParams))
    if (!queryParsed.success) {
      return errorResponse("Invalid query parameters", 400, queryParsed.error.flatten())
    }

    const { page, limit, offset } = parsePagination(url.searchParams)
    const { status, kind } = queryParsed.data

    const conditions = [eq(campaigns.tenantId, tenant.id)]
    if (status) {
      conditions.push(eq(campaigns.status, status))
    }
    const automationOf = sql`${campaigns.content}->>'automation'`
    if (kind === "manual") {
      conditions.push(sql`${automationOf} IS NULL AND ${campaigns.type} <> 'wallet_update'`)
    } else if (kind === "scheduled") {
      conditions.push(eq(campaigns.status, "scheduled"))
    } else if (kind === "silent") {
      conditions.push(eq(campaigns.type, "wallet_update"))
    } else if (kind) {
      conditions.push(sql`${automationOf} = ${kind}`)
    }

    // Which kinds exist for this tenant, so the filter only offers real options.
    const facetRows = await db
      .select({
        k: sql<string>`CASE
          WHEN ${campaigns.type} = 'wallet_update' THEN 'silent'
          WHEN ${automationOf} IN ('birthday','recurring','points_expiring','churn') THEN ${automationOf}
          ELSE 'manual' END`,
        scheduled: sql<number>`count(*) FILTER (WHERE ${campaigns.status} = 'scheduled')::int`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(campaigns)
      .where(eq(campaigns.tenantId, tenant.id))
      .groupBy(sql`1`)
    const kinds: Record<string, number> = {}
    let scheduledTotal = 0
    for (const r of facetRows) {
      kinds[r.k] = (kinds[r.k] ?? 0) + Number(r.cnt)
      scheduledTotal += Number(r.scheduled)
    }
    if (scheduledTotal > 0) kinds.scheduled = scheduledTotal

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
        // Segment clients with no pass on any wallet (recorded by executeCampaign).
        skippedNoPass: sql<number>`coalesce((${campaigns.content}->>'skippedNoPass')::int, 0)`,
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
      kinds,
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}
