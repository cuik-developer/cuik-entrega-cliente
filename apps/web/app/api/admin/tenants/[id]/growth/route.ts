import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { UUID } from "@/lib/growth/route-utils"
import { growthRulesSchema } from "@/lib/growth/rules"
import { getRules, saveRules } from "@/lib/growth/store"

type Params = { params: Promise<{ id: string }> }

/** GET /api/admin/tenants/[id]/growth — the tenant's Growth rules and terms (defaults when unset). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    return successResponse(await getRules(id))
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/growth]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** PUT /api/admin/tenants/[id]/growth — updates the fields given; the rest stay. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const parsed = growthRulesSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Validation failed", 400)
    }
    return successResponse(await saveRules(id, parsed.data, session.user.id))
  } catch (error) {
    console.error("[PUT /api/admin/tenants/[id]/growth]", error)
    return errorResponse("Internal server error", 500)
  }
}
