import { z } from "zod"
import { type MonthCtx, periodErrorResponse, periodGuard } from "@/lib/admin/period-route"
import { updatePeriodInfo } from "@/lib/admin/periods-data"
import { badRequest } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

const YMD = /^\d{4}-\d{2}-\d{2}$/
const realDate = (v: string) => {
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
const date = z.string().regex(YMD).refine(realDate, "Fecha inválida").nullable()
const schema = z.object({
  dueDate: date,
  reserveMovedOn: date,
  reserveAmount: z.number().min(0).max(10_000_000).nullable(),
  notes: z.string().trim().max(1000).nullable(),
})

/** Due date of the PDT, the annual-tax reserve moved to the bank, notes. */
export async function PUT(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    try {
      await updatePeriodInfo(g.month, parsed.data, g.session.user.id)
    } catch (err) {
      const res = periodErrorResponse(err)
      if (res) return res
      throw err
    }
    return successResponse({ month: g.month })
  } catch (err) {
    console.error("[PUT /api/admin/finance/periods/[month]]", err)
    return errorResponse("Internal server error", 500)
  }
}
