import { errorResponse, successResponse } from "@/lib/api-utils"
import { growthContext } from "@/lib/growth/route-utils"
import { audiencesOverview } from "@/lib/growth/store"

export const dynamic = "force-dynamic"

/** GET /api/[tenant]/growth/audiences — every audience with its counts and last send. */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    return successResponse(await audiencesOverview(g.ctx.tenant))
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/audiences]", error)
    return errorResponse("Internal server error", 500)
  }
}
