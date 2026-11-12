import { errorResponse, successResponse } from "@/lib/api-utils"
import { AUDIENCE_BY_SLUG, type AudienceSlug } from "@/lib/growth/audiences"
import { growthContext } from "@/lib/growth/route-utils"
import { sendPreview } from "@/lib/growth/sends"
import { audienceMembers } from "@/lib/growth/store"

export const dynamic = "force-dynamic"

/**
 * GET /api/[tenant]/growth/audiences/[slug] — the audience's clients with
 * today's suggestion state. `?preview=1[&store=…]` returns instead what a
 * send created now would hold (ready, excluded, control).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; slug: string }> },
) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { slug } = await params
    if (!AUDIENCE_BY_SLUG.has(slug as AudienceSlug)) {
      return errorResponse("Audiencia no encontrada", 404)
    }
    const url = new URL(request.url)
    if (url.searchParams.get("preview") === "1") {
      const store = url.searchParams.get("store")?.trim() || null
      return successResponse(await sendPreview(g.ctx.tenant, slug as AudienceSlug, store))
    }
    const { def, today, rows } = await audienceMembers(g.ctx.tenant, slug as AudienceSlug)
    return successResponse({ audience: def, today, rows })
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/audiences/[slug]]", error)
    return errorResponse("Internal server error", 500)
  }
}
