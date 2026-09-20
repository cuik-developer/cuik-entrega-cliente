import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { getClientPointsHistory } from "@/lib/crm/client-points"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/[tenant]/clients/[id]/points[?limit=N]
 * Points statement of one client: balance, lifetime totals and every
 * movement (newest first) with the balance after each one, the reward
 * redeemed and the cashier involved.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    if (!UUID.test(id)) return errorResponse("Invalid client ID format", 400)

    const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? 200)
    const limit = Number.isInteger(limitRaw) ? limitRaw : 200

    const data = await getClientPointsHistory({ tenantId: tenant.id, clientId: id, limit })
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]/points]", error)
    return errorResponse("Internal server error", 500)
  }
}
