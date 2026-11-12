import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { connectorTenants } from "@/lib/pos/links-review"

export const dynamic = "force-dynamic"

/** GET /api/admin/pos-links — the tenants with a POS connection, for Validación de enlaces. */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    return successResponse(await connectorTenants())
  } catch (error) {
    console.error("[GET /api/admin/pos-links]", error)
    return errorResponse("Internal server error", 500)
  }
}
