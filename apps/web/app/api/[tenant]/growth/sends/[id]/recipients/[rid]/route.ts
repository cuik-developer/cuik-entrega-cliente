import { z } from "zod"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { growthContext, UUID } from "@/lib/growth/route-utils"
import { applyRecipientAction, type RecipientAction } from "@/lib/growth/sends"

export const dynamic = "force-dynamic"

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("opened") }),
  z.object({ action: z.literal("sent"), messageText: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("replied") }),
  z.object({ action: z.literal("skipped") }),
  z.object({ action: z.literal("pending") }),
  z.object({
    action: z.literal("blocked"),
    reason: z.enum(["pet_died", "asked_no_contact", "wrong_number", "other"]),
    note: z.string().trim().max(300).nullable().optional(),
  }),
])

/**
 * PATCH /api/[tenant]/growth/sends/[id]/recipients/[rid] — one step of the
 * guided flow: opened (chat launched), sent (the ✓ check; starts attribution
 * and cooldown), replied, skipped, pending (undo) or blocked (No contactar).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string; rid: string }> },
) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const { rid } = await params
    if (!UUID.test(rid)) return errorResponse("Cliente del envío no encontrado", 404)
    const parsed = actionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Acción inválida", 400)
    const action: RecipientAction =
      parsed.data.action === "blocked"
        ? { action: "blocked", reason: parsed.data.reason, note: parsed.data.note ?? null }
        : parsed.data
    const result = await applyRecipientAction({
      tenant: g.ctx.tenant,
      recipientId: rid,
      userId: g.ctx.session.user.id,
      action,
    })
    if (!result.ok) return errorResponse(result.error, result.status ?? 400)
    return successResponse(result)
  } catch (error) {
    console.error("[PATCH /api/[tenant]/growth/sends/[id]/recipients/[rid]]", error)
    return errorResponse("Internal server error", 500)
  }
}
