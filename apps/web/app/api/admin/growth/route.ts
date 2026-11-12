import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { growthOverview } from "@/lib/growth/results"

export const dynamic = "force-dynamic"

/** GET /api/admin/growth[?month=YYYY-MM] — every tenant: connector, sends, attributed sales and billing of the month. */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const given = new URL(request.url).searchParams.get("month")
    const month =
      given && /^\d{4}-\d{2}$/.test(given)
        ? given
        : new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7)
    return successResponse({ month, tenants: await growthOverview(month) })
  } catch (error) {
    console.error("[GET /api/admin/growth]", error)
    return errorResponse("Internal server error", 500)
  }
}
