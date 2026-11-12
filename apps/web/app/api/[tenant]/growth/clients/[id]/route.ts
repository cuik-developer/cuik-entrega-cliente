import { z } from "zod"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { growthContext, UUID } from "@/lib/growth/route-utils"
import { addContactBlock, clientGrowth, liftContactBlock } from "@/lib/growth/store"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ tenant: string; id: string }> }

/** GET /api/[tenant]/growth/clients/[id] — the client's Growth tab: rhythm, audiences, sends, attributed sales, block. */
export async function GET(request: Request, { params }: Params) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Cliente no encontrado", 404)
    return successResponse(await clientGrowth(g.ctx.tenant, id))
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/clients/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

const blockSchema = z.object({
  reason: z.enum(["pet_died", "asked_no_contact", "wrong_number", "other"]),
  note: z.string().trim().max(300).nullable().optional(),
})

/** POST /api/[tenant]/growth/clients/[id] { reason, note? } — marks the client "No contactar". */
export async function POST(request: Request, { params }: Params) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Cliente no encontrado", 404)
    const parsed = blockSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Motivo inválido", 400)
    const block = await addContactBlock({
      tenantId: g.ctx.tenant.id,
      clientId: id,
      reason: parsed.data.reason,
      note: parsed.data.note ?? null,
      userId: g.ctx.session.user.id,
    })
    if (!block) return errorResponse("Cliente no encontrado", 404)
    return successResponse(block, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/growth/clients/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** DELETE /api/[tenant]/growth/clients/[id] — lifts the active "No contactar". */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Cliente no encontrado", 404)
    const lifted = await liftContactBlock({
      tenantId: g.ctx.tenant.id,
      clientId: id,
      userId: g.ctx.session.user.id,
    })
    if (!lifted) return errorResponse("El cliente no estaba marcado", 400)
    return successResponse({ lifted: true })
  } catch (error) {
    console.error("[DELETE /api/[tenant]/growth/clients/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
