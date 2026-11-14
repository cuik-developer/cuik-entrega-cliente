import { buildCloseTemplate } from "@/lib/admin/close-excel"
import { type MonthCtx, periodErrorResponse, periodGuard } from "@/lib/admin/period-route"
import { closeTemplateData } from "@/lib/admin/periods-data"
import { errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

/** The close template for the accountant, prefilled with the panel's figures and registry. */
export async function GET(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    let data: Awaited<ReturnType<typeof closeTemplateData>>
    try {
      data = await closeTemplateData(g.month)
    } catch (err) {
      const res = periodErrorResponse(err)
      if (res) return res
      throw err
    }
    const buf = await buildCloseTemplate(data)
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cierre-cuik-${g.month}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    console.error("[GET /api/admin/finance/periods/[month]/template]", err)
    return errorResponse("Internal server error", 500)
  }
}
