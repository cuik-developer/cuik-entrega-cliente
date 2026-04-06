import { and, count, db, desc, eq, ilike, sql, tenants } from "@cuik/db"
import {
  errorResponse,
  paginationMeta,
  parsePagination,
  requireAuth,
  requireRole,
  successResponse,
} from "@/lib/api-utils"

export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { searchParams } = new URL(request.url)
    const { page, limit, offset } = parsePagination(searchParams)

    const statusFilter = searchParams.get("status")
    const searchFilter = searchParams.get("search")

    // Validate status filter
    const validStatuses = ["pending", "trial", "active", "expired", "cancelled", "paused"] as const
    const isValidStatus =
      statusFilter && validStatuses.includes(statusFilter as (typeof validStatuses)[number])

    // Build where conditions
    const conditions = []
    if (isValidStatus) {
      conditions.push(eq(tenants.status, statusFilter as (typeof validStatuses)[number]))
    }
    if (searchFilter && searchFilter.trim().length > 0) {
      conditions.push(ilike(tenants.name, `%${searchFilter.trim()}%`))
    }
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const [{ total }] = await db.select({ total: count() }).from(tenants).where(whereCondition)

    // Get tenants (basic columns only — no correlated subqueries)
    const tenantRows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        planId: tenants.planId,
        trialEndsAt: tenants.trialEndsAt,
        activatedAt: tenants.activatedAt,
        ownerId: tenants.ownerId,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
        branding: tenants.branding,
        businessType: tenants.businessType,
        address: tenants.address,
        phone: tenants.phone,
        contactEmail: tenants.contactEmail,
        timezone: tenants.timezone,
        segmentationConfig: tenants.segmentationConfig,
        appleConfig: tenants.appleConfig,
      })
      .from(tenants)
      .where(whereCondition)
      .orderBy(desc(tenants.createdAt))
      .limit(limit)
      .offset(offset)

    // Batch queries for counts — avoids correlated subquery issues with Drizzle
    const tenantIds = tenantRows.map((t) => t.id)

    if (tenantIds.length === 0) {
      return successResponse({
        items: [],
        pagination: paginationMeta(total, page, limit),
      })
    }

    const tenantIdList = sql.join(
      tenantIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )

    const [clientCounts, visitCounts, rewardCounts, returnRates, planNames] = await Promise.all([
      db.execute<{ tenant_id: string; cnt: number }>(
        sql`SELECT tenant_id, count(*)::int AS cnt FROM loyalty.clients WHERE tenant_id IN (${tenantIdList}) GROUP BY tenant_id`,
      ),
      db.execute<{ tenant_id: string; cnt: number }>(
        sql`SELECT tenant_id, count(*)::int AS cnt FROM loyalty.visits WHERE tenant_id IN (${tenantIdList}) GROUP BY tenant_id`,
      ),
      db.execute<{ tenant_id: string; cnt: number }>(
        sql`SELECT tenant_id, count(*)::int AS cnt FROM loyalty.rewards WHERE tenant_id IN (${tenantIdList}) AND status = 'redeemed' GROUP BY tenant_id`,
      ),
      db.execute<{ tenant_id: string; return_rate: number }>(
        sql`SELECT tenant_id, CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE total_visits > 1) / count(*))::int END AS return_rate FROM loyalty.clients WHERE tenant_id IN (${tenantIdList}) GROUP BY tenant_id`,
      ),
      (() => {
        const planIds = [...new Set(tenantRows.map((t) => t.planId).filter(Boolean))]
        if (planIds.length === 0) return { rows: [] as { id: string; name: string }[] }
        return db.execute<{ id: string; name: string }>(
          sql`SELECT id, name FROM plans WHERE id IN (${sql.join(
            planIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        )
      })(),
    ])

    // Build lookup maps
    const clientCountMap = new Map(clientCounts.rows.map((r) => [r.tenant_id, Number(r.cnt)]))
    const visitCountMap = new Map(visitCounts.rows.map((r) => [r.tenant_id, Number(r.cnt)]))
    const rewardCountMap = new Map(rewardCounts.rows.map((r) => [r.tenant_id, Number(r.cnt)]))
    const returnRateMap = new Map(returnRates.rows.map((r) => [r.tenant_id, Number(r.return_rate)]))
    const planNameMap = new Map(planNames.rows.map((r) => [r.id, r.name]))

    const results = tenantRows.map((t) => ({
      ...t,
      clientCount: clientCountMap.get(t.id) ?? 0,
      visitCount: visitCountMap.get(t.id) ?? 0,
      rewardCount: rewardCountMap.get(t.id) ?? 0,
      returnRate: returnRateMap.get(t.id) ?? 0,
      planName: t.planId ? (planNameMap.get(t.planId) ?? null) : null,
    }))

    return successResponse({
      items: results,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants]", error)
    return errorResponse("Internal server error", 500)
  }
}
