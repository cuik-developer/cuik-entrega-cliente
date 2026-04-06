import { summaryQuerySchema } from "@cuik/shared/validators"
import { computeAnalyticsSummary } from "@/lib/analytics"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const url = new URL(request.url)
    const rawParams = Object.fromEntries(url.searchParams)

    // Only validate if params are provided (both from and to are required by schema)
    let from: string | undefined
    let to: string | undefined

    if (rawParams.from || rawParams.to) {
      const parsed = summaryQuerySchema.safeParse(rawParams)
      if (!parsed.success) {
        return errorResponse("Invalid query parameters", 400, parsed.error.flatten())
      }
      from = parsed.data.from
      to = parsed.data.to
    }

    const summary = await computeAnalyticsSummary(tenant.id, { from, to })

    return successResponse(summary)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/summary]", error)
    return errorResponse("Internal server error", 500)
  }
}
