import { and, count, db, desc, eq, solicitudes, sql, user } from "@cuik/db"
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

    // Validate status filter against allowed values
    const validStatuses = ["pending", "approved", "rejected"] as const
    const isValidStatus =
      statusFilter && validStatuses.includes(statusFilter as (typeof validStatuses)[number])

    // Rejected requests leave the list 30 days after the rejection; `archived=1`
    // shows only those. Approved/pending are never archived. "Todas" hides
    // archived rejections too, so the default view stays focused.
    const archived = searchParams.get("archived") === "1"
    const cutoff = new Date(Date.now() - 30 * 86_400_000)
    const status = isValidStatus ? (statusFilter as "pending" | "approved" | "rejected") : null
    // Legacy rejections (before reviewed_at existed) fall back to created_at.
    const reviewedAt = sql`COALESCE(${solicitudes.reviewedAt}, ${solicitudes.createdAt})`
    const rejectedRecent = and(eq(solicitudes.status, "rejected"), sql`${reviewedAt} >= ${cutoff}`)
    const rejectedArchived = and(eq(solicitudes.status, "rejected"), sql`${reviewedAt} < ${cutoff}`)
    let whereCondition: ReturnType<typeof and>
    if (archived) {
      whereCondition = rejectedArchived
    } else if (status === "rejected") {
      whereCondition = rejectedRecent
    } else if (status) {
      whereCondition = eq(solicitudes.status, status)
    } else {
      whereCondition = sql`NOT (${rejectedArchived})`
    }

    // Get total count
    const [{ total }] = await db.select({ total: count() }).from(solicitudes).where(whereCondition)
    // How many rejections are archived (for the "Ver archivadas (N)" link)
    const [{ archivedCount }] = await db
      .select({ archivedCount: count() })
      .from(solicitudes)
      .where(rejectedArchived)

    // Get paginated results (+ reviewer name)
    const results = await db
      .select({
        id: solicitudes.id,
        businessName: solicitudes.businessName,
        businessType: solicitudes.businessType,
        contactName: solicitudes.contactName,
        email: solicitudes.email,
        phone: solicitudes.phone,
        city: solicitudes.city,
        status: solicitudes.status,
        tenantId: solicitudes.tenantId,
        notes: solicitudes.notes,
        reviewedAt: solicitudes.reviewedAt,
        reviewedBy: user.name,
        createdAt: solicitudes.createdAt,
      })
      .from(solicitudes)
      .leftJoin(user, eq(user.id, solicitudes.reviewedBy))
      .where(whereCondition)
      .orderBy(desc(solicitudes.createdAt))
      .limit(limit)
      .offset(offset)

    return successResponse({
      items: results,
      archivedCount: Number(archivedCount),
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/admin/solicitudes]", error)
    return errorResponse("Internal server error", 500)
  }
}
