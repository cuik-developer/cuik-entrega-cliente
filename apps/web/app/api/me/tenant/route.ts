import { errorResponse, requireAuth, successResponse } from "@/lib/api-utils"
import { getTenantForUser } from "@/lib/tenant-context"

export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const tenant = await getTenantForUser(session.user.id)

    if (!tenant) {
      return errorResponse("No tenant found for this user", 404)
    }

    return successResponse(tenant)
  } catch (error) {
    console.error("[GET /api/me/tenant]", error)
    return errorResponse("Internal server error", 500)
  }
}
