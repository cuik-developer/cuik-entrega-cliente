import { z } from "zod"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { AUDIENCES, type AudienceSlug } from "@/lib/growth/audiences"
import { growthContext } from "@/lib/growth/route-utils"
import { createSend, listSends } from "@/lib/growth/sends"
import { TEMPLATES, type TemplateKey } from "@/lib/growth/templates"

export const dynamic = "force-dynamic"

/** GET /api/[tenant]/growth/sends — every send, newest first, with its counts. */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    return successResponse(await listSends(g.ctx.tenant))
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/sends]", error)
    return errorResponse("Internal server error", 500)
  }
}

const AUDIENCE_SLUGS = AUDIENCES.map((a) => a.slug) as [AudienceSlug, ...AudienceSlug[]]
const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key) as [TemplateKey, ...TemplateKey[]]

const createSchema = z.object({
  audience: z.enum(AUDIENCE_SLUGS),
  templateKey: z.enum(TEMPLATE_KEYS),
  templateText: z.string().trim().min(1).max(2000),
  channel: z.enum(["whatsapp", "export"]).default("whatsapp"),
  senderName: z.string().trim().max(80).nullable().optional(),
  store: z.string().trim().max(120).nullable().optional(),
})

/**
 * POST /api/[tenant]/growth/sends — freezes today's ready clients of the
 * audience into a send (control drawn now) and renders each client's message.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Datos inválidos", 400)
    }
    const result = await createSend({
      tenant: g.ctx.tenant,
      audience: parsed.data.audience,
      templateKey: parsed.data.templateKey,
      templateText: parsed.data.templateText,
      channel: parsed.data.channel,
      senderName: parsed.data.senderName || null,
      store: parsed.data.store || null,
      userId: g.ctx.session.user.id,
    })
    if (!result.ok) return errorResponse(result.error, 400)
    return successResponse(result, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/growth/sends]", error)
    return errorResponse("Internal server error", 500)
  }
}
