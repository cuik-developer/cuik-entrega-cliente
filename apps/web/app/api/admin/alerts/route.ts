import { collectAdminAlerts } from "@/lib/admin/admin-digest"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** GET /api/admin/alerts — live alerts for the tenant manager strip (no cadence). */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    return successResponse(await collectAdminAlerts())
  } catch (error) {
    console.error("[GET /api/admin/alerts]", error)
    return errorResponse("Internal server error", 500)
  }
}
