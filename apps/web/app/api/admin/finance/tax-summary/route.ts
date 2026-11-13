import { financeMonthSchema } from "@cuik/shared/validators"
import { currentMonthLima } from "@/lib/admin/company-data"
import { requireSuperAdmin } from "@/lib/admin/route-guard"
import { loadTaxSummary } from "@/lib/admin/tax-data"
import { errorResponse, successResponse } from "@/lib/api-utils"

/** Finanzas › Resumen fiscal of ?month=YYYY-MM (default: this month in Lima). */
export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const m = new URL(request.url).searchParams.get("month")
    const month = m && financeMonthSchema.safeParse(m).success ? m : currentMonthLima()
    return successResponse(await loadTaxSummary(month))
  } catch (err) {
    console.error("[GET /api/admin/finance/tax-summary]", err)
    return errorResponse("Internal server error", 500)
  }
}
