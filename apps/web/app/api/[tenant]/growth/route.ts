import { errorResponse, successResponse } from "@/lib/api-utils"
import { growthContext } from "@/lib/growth/route-utils"
import { growthSummary } from "@/lib/growth/store"

export const dynamic = "force-dynamic"

/** GET /api/[tenant]/growth — Resumen: audiences, open sends, this month's attributed sales, rules. */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    return successResponse(await growthSummary(g.ctx.tenant))
  } catch (error) {
    console.error("[GET /api/[tenant]/growth]", error)
    return errorResponse("Internal server error", 500)
  }
}
