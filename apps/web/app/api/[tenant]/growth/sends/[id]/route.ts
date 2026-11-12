import { errorResponse, successResponse } from "@/lib/api-utils"
import { growthContext, UUID } from "@/lib/growth/route-utils"
import { closeSend, getSend } from "@/lib/growth/sends"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ tenant: string; id: string }> }

/** GET /api/[tenant]/growth/sends/[id] — the send with every client, message and state. */
export async function GET(request: Request, { params }: Params) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Envío no encontrado", 404)
    const send = await getSend(g.ctx.tenant, id)
    if (!send) return errorResponse("Envío no encontrado", 404)
    return successResponse(send)
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/sends/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** PATCH /api/[tenant]/growth/sends/[id] { action: "close" } — closes the send; what was sent keeps measuring. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Envío no encontrado", 404)
    const body = (await request.json().catch(() => null)) as { action?: string } | null
    if (body?.action !== "close") return errorResponse("Acción desconocida", 400)
    const closed = await closeSend(g.ctx.tenant, id)
    if (!closed) return errorResponse("El envío no existe o ya está cerrado", 400)
    return successResponse({ closed: true })
  } catch (error) {
    console.error("[PATCH /api/[tenant]/growth/sends/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
