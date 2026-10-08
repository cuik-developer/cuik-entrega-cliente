import { and, count, db, desc, eq, ilike, tenants } from "@cuik/db"
import { enrichTenantRows } from "@/lib/admin/tenant-summary"
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

    const results = await enrichTenantRows(tenantRows)

    return successResponse({
      items: results,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants]", error)
    return errorResponse("Internal server error", 500)
  }
}
