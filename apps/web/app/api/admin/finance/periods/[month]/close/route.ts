import { type MonthCtx, periodErrorResponse, periodGuard } from "@/lib/admin/period-route"
import { closePeriod } from "@/lib/admin/periods-data"
import { errorResponse, successResponse } from "@/lib/api-utils"

/** Close the month: locks its documents; the accountant's declaration carries forward. */
export async function POST(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    try {
      await closePeriod(g.month, g.session.user.id)
    } catch (err) {
      const res = periodErrorResponse(err)
      if (res) return res
      throw err
    }
    return successResponse({ month: g.month })
  } catch (err) {
    console.error("[POST /api/admin/finance/periods/[month]/close]", err)
    return errorResponse("Internal server error", 500)
  }
}
