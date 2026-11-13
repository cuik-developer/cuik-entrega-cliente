import { loadCompany } from "@/lib/admin/company-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Finanzas › Empresa y régimen: issuers, tax profiles and UIT. */
export async function GET(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[GET /api/admin/finance/company]", err)
    return errorResponse("Internal server error", 500)
  }
}
