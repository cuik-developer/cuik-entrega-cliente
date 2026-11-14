import { financeMonthSchema } from "@cuik/shared/validators"
import { loadClosesPage } from "@/lib/admin/periods-data"
import { requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

/** Finanzas › Cierres: all months and the detail of ?month=YYYY-MM (default: the latest). */
export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const m = new URL(request.url).searchParams.get("month")
    const month = m && financeMonthSchema.safeParse(m).success ? m : null
    return successResponse(await loadClosesPage(month))
  } catch (err) {
    console.error("[GET /api/admin/finance/periods]", err)
    return errorResponse("Internal server error", 500)
  }
}
