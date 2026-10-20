import { and, db, eq, passDesigns, promotions } from "@cuik/db"
import { stampsConfigSaveSchema } from "@cuik/shared/validators/pass-design-schema"
import { loadAssetBuffer } from "@cuik/wallet/shared"
import { z } from "zod"

import { errorResponse, requireAuth, requireSuperAdminOr } from "@/lib/api-utils"
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit"
import { buildStripImages } from "@/lib/wallet/points-strip"
import {
  type StampsConfigLike,
  safeAssetUrl,
  stripLayoutFrom,
  stripMaxVisits,
} from "@/lib/wallet/strip-layout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * "Vista real" of the pass editor: the Apple strip PNG (750×288) the server
 * would build for an UNSAVED design config, through the same code path as the
 * wallet routes (stripLayoutFrom + stripMaxVisits + buildStripImages), with the
 * linked promotion's maxVisits and a sample progress.
 *
 * Only our own images are read: uploaded assets (`/api/assets/...`, same
 * check as the wallet routes) and the bundled `/defaults/*.png`. Any other URL
 * is refused, so this can never be used to fetch arbitrary hosts.
 */

const DEFAULT_ASSET = /^\/defaults\/[a-z0-9-]+\.png$/

function ownImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null
  // Our asset keys never contain "%": an encoded "%2e%2e" would be resolved as
  // ".." by the HTTP fallback of loadAssetBuffer and reach other app routes.
  if (url.includes("%")) return null
  return safeAssetUrl(url) ?? (DEFAULT_ASSET.test(url.trim()) ? url.trim() : null)
}

const bodySchema = z.object({
  assets: z.object({
    stripBg: z.string().max(512).nullable().optional(),
    stamp: z.string().max(512).nullable().optional(),
  }),
  stampsConfig: stampsConfigSaveSchema,
  stampsInCycle: z.number().int().min(0).max(50).default(3),
  completed: z.boolean().default(false),
})

const PREVIEW_LIMIT = 30
const PREVIEW_WINDOW_MS = 10 * 60 * 1000

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  // ── Auth: super_admin, or Equipo Cuik with "designs" ─────────────
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = await requireSuperAdminOr(session, "designs")
  if (roleError) return roleError

  if (!checkRateLimit(`strip-preview:${session.user.id}`, PREVIEW_LIMIT, PREVIEW_WINDOW_MS)) {
    return errorResponse(RATE_LIMIT_MESSAGE, 429)
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return errorResponse("Diseño no encontrado", 404)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorResponse("JSON inválido", 400)
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message ?? "Configuración inválida", 400)
  }
  const body = parsed.data

  // ── Design + linked promotion (maxVisits / program type) ─────────
  const [design] = await db
    .select({ promotionId: passDesigns.promotionId, tenantId: passDesigns.tenantId })
    .from(passDesigns)
    .where(eq(passDesigns.id, id))
    .limit(1)
  if (!design) return errorResponse("Diseño no encontrado", 404)

  // Linked promotion, else the tenant's active one: the wallet routes count
  // against the active promotion even for a design that is not linked to it.
  let promo: { maxVisits: number | null; type: string } | undefined
  if (design.promotionId) {
    ;[promo] = await db
      .select({ maxVisits: promotions.maxVisits, type: promotions.type })
      .from(promotions)
      .where(eq(promotions.id, design.promotionId))
      .limit(1)
  }
  if (!promo) {
    ;[promo] = await db
      .select({ maxVisits: promotions.maxVisits, type: promotions.type })
      .from(promotions)
      .where(and(eq(promotions.tenantId, design.tenantId), eq(promotions.active, true)))
      .limit(1)
  }

  // ── Images: our own assets only ──────────────────────────────────
  const stripUrl = body.assets.stripBg ? ownImageUrl(body.assets.stripBg) : null
  const stampUrl = body.assets.stamp ? ownImageUrl(body.assets.stamp) : null
  if ((body.assets.stripBg && !stripUrl) || (body.assets.stamp && !stampUrl)) {
    return errorResponse("Solo se pueden usar imágenes subidas a Cuik", 400)
  }
  const cfg = body.stampsConfig as StampsConfigLike
  // Same rule as the wallet routes: an invalid special icon falls back to the badge.
  const specialUrl = safeAssetUrl(cfg.specialStampUrl)

  try {
    const [background, stamp, specialStamp] = await Promise.all([
      stripUrl ? loadAssetBuffer(stripUrl) : null,
      stampUrl ? loadAssetBuffer(stampUrl) : null,
      specialUrl ? loadAssetBuffer(specialUrl).catch(() => null) : null,
    ])

    const maxVisits = stripMaxVisits(promo, cfg)
    const stampsInCycle = Math.min(body.stampsInCycle, Math.max(0, maxVisits - 1))
    const { strip2x } = await buildStripImages({
      programType: promo?.type === "points" ? "points" : "stamps",
      background,
      stamp,
      stampsInCycle: body.completed ? 0 : stampsInCycle,
      maxVisits,
      gridLayout: stripLayoutFrom(cfg),
      specialStamp,
      completed: body.completed,
    })

    return new Response(new Uint8Array(strip2x), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    })
  } catch (err) {
    console.error("[POST /api/admin/pass-designs/[id]/preview]", err)
    return errorResponse("No se pudo generar la franja", 500)
  }
}
