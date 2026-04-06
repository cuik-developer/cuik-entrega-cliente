import { asc, db, plans } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const results = await db.select().from(plans).orderBy(asc(plans.name))

    return successResponse(results)
  } catch (error) {
    console.error("[GET /api/admin/plans]", error)
    return errorResponse("Internal server error", 500)
  }
}
