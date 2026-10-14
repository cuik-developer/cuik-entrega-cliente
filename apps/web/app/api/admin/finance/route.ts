import { loadFinance } from "@/lib/admin/finance-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Everything the Finanzas screens show: rates, recurring items, entries and loans. */
export async function GET(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[GET /api/admin/finance]", err)
    return errorResponse("Internal server error", 500)
  }
}
