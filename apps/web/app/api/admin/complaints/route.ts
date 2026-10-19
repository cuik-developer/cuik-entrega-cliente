import { loadComplaints } from "@/lib/admin/complaints-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Libro de Reclamaciones: every Hoja de Reclamación, newest first. */
export async function GET(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    return successResponse(await loadComplaints())
  } catch (err) {
    console.error("[GET /api/admin/complaints]", err)
    return errorResponse("Internal server error", 500)
  }
}
