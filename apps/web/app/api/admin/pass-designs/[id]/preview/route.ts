import { db, eq, passDesigns } from "@cuik/db"
import type { SerializedCanvas } from "@cuik/shared/types/editor"
import { generateStripImage } from "@cuik/wallet/apple"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  // ── Auth ──────────────────────────────────────────────────────────
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  // ── Fetch design ─────────────────────────────────────────────────
  const { id } = await params

  const results = await db.select().from(passDesigns).where(eq(passDesigns.id, id)).limit(1)

  const design = results[0]
  if (!design) {
    return errorResponse("Diseno no encontrado", 404)
  }

  const canvasData = design.canvasData as SerializedCanvas | null
  if (!canvasData || !canvasData.nodes) {
    return errorResponse("El canvas esta vacio — guarda el diseno antes de generar preview", 400)
  }

  // ── Extract background image ─────────────────────────────────────
  const bgNode = canvasData.nodes.find(
    (n) =>
      n.type === "image" &&
      (n.props.assetType === "strip_bg" || n.props.assetType === "background"),
  )

  if (!bgNode || bgNode.type !== "image") {
    return errorResponse("Falta la imagen de fondo (strip_bg o background) en el canvas", 400)
  }

  const backgroundImageDataUri = bgNode.props.src

  // ── Extract stamp icon ───────────────────────────────────────────
  const stampGridNode = canvasData.nodes.find((n) => n.type === "stamp-grid")

  if (!stampGridNode || stampGridNode.type !== "stamp-grid") {
    return errorResponse("Falta el nodo stamp-grid en el canvas", 400)
  }

  const stampImageDataUri = stampGridNode.props.stampSrc
  const maxVisits = stampGridNode.props.maxVisits

  // ── Generate strip image ─────────────────────────────────────────
  try {
    const result = await generateStripImage({
      backgroundImageDataUri,
      stampImageDataUri,
      stampsInCycle: Math.floor(maxVisits / 2),
      maxVisits,
    })

    const strip2x = result.strip2x.toString("base64")
    const strip1x = result.strip1x.toString("base64")

    return successResponse({ strip2x, strip1x })
  } catch (err) {
    console.error("[POST /api/admin/pass-designs/[id]/preview]", err)
    return errorResponse("Error al generar la preview del pase", 500)
  }
}
