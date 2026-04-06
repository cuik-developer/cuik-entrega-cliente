import { db, eq, tenants, user } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params

    // Get tenant owner
    const [tenant] = await db
      .select({ ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)

    if (!tenant?.ownerId) {
      return errorResponse("Tenant or owner not found", 404)
    }

    // Get owner email
    const [owner] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, tenant.ownerId))
      .limit(1)

    if (!owner) {
      return errorResponse("Owner user not found", 404)
    }

    return successResponse({ email: owner.email, name: owner.name })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/admin-info]", error)
    return errorResponse("Internal server error", 500)
  }
}
