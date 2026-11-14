import { loadFinanceHome } from "@/lib/admin/finance-agenda"
import { requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

/** Finanzas › Inicio: the month at a glance and the finance agenda. */
export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    return successResponse(await loadFinanceHome())
  } catch (err) {
    console.error("[GET /api/admin/finance/home]", err)
    return errorResponse("Internal server error", 500)
  }
}
