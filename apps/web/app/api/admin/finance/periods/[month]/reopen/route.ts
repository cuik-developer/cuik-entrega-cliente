import { z } from "zod"
import { type MonthCtx, periodErrorResponse, periodGuard } from "@/lib/admin/period-route"
import { reopenPeriod } from "@/lib/admin/periods-data"
import { badRequest } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

const schema = z.object({ reason: z.string().trim().min(3, "Escribe el motivo").max(500) })

/** Reopen a closed month (with a reason that stays on record). */
export async function POST(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    try {
      await reopenPeriod(g.month, parsed.data.reason, g.session.user.id)
    } catch (err) {
      const res = periodErrorResponse(err)
      if (res) return res
      throw err
    }
    return successResponse({ month: g.month })
  } catch (err) {
    console.error("[POST /api/admin/finance/periods/[month]/reopen]", err)
    return errorResponse("Internal server error", 500)
  }
}
