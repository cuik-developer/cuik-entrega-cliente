import { count, db, desc, eq, solicitudes } from "@cuik/db"
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

    // Build where condition (ignore invalid status values)
    const whereCondition = isValidStatus
      ? eq(solicitudes.status, statusFilter as "pending" | "approved" | "rejected")
      : undefined

    // Get total count
    const [{ total }] = await db.select({ total: count() }).from(solicitudes).where(whereCondition)

    // Get paginated results
    const results = await db
      .select()
      .from(solicitudes)
      .where(whereCondition)
      .orderBy(desc(solicitudes.createdAt))
      .limit(limit)
      .offset(offset)

    return successResponse({
      items: results,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/admin/solicitudes]", error)
    return errorResponse("Internal server error", 500)
  }
}
