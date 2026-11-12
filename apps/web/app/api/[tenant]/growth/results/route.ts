import { errorResponse, successResponse } from "@/lib/api-utils"
import { attributedTickets, defaultRange, sendResults } from "@/lib/growth/results"
import { growthContext } from "@/lib/growth/route-utils"
import { todayOf } from "@/lib/growth/store"

export const dynamic = "force-dynamic"

const YMD = /^\d{4}-\d{2}-\d{2}$/
const YM = /^\d{4}-\d{2}$/

/**
 * GET /api/[tenant]/growth/results[?from=YYYY-MM-DD&to=YYYY-MM-DD] — every
 * send of the range with what the POS sold after it, sent vs control.
 * `?tickets=YYYY-MM` lists that month's attributed tickets one by one.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const url = new URL(request.url)
    const tickets = url.searchParams.get("tickets")
    if (tickets) {
      if (!YM.test(tickets)) return errorResponse("Mes inválido", 400)
      return successResponse(await attributedTickets(g.ctx.tenant, tickets))
    }
    const today = todayOf(g.ctx.tenant.timezone)
    const def = defaultRange(today)
    const from = url.searchParams.get("from") ?? def.from
    const to = url.searchParams.get("to") ?? def.to
    if (!YMD.test(from) || !YMD.test(to) || from > to) return errorResponse("Rango inválido", 400)
    return successResponse(await sendResults(g.ctx.tenant, { from, to }))
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/results]", error)
    return errorResponse("Internal server error", 500)
  }
}
