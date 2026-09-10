import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { getClientTimeline } from "@/lib/crm/client-timeline"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/[tenant]/clients/[id]/timeline[?limit=N]
 * Chronological feed (newest first) of visits, rewards, notes, campaign
 * notifications and the registration of one client.
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

    const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? 100)
    const limit = Number.isInteger(limitRaw) ? limitRaw : 100

    const events = await getClientTimeline({ tenantId: tenant.id, clientId: id, limit })
    return successResponse(events)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]/timeline]", error)
    return errorResponse("Internal server error", 500)
  }
}
