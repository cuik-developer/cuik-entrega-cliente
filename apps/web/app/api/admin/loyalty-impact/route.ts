import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import {
  impactSettingsSchema,
  loadLoyaltyImpact,
  saveImpactSettings,
} from "@/lib/loyalty/loyalty-impact/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** `?window=` as a number, or null to use the saved or suggested one. */
function askedWindow(url: URL): number | null {
  const raw = url.searchParams.get("window")
  if (raw === null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * GET /api/admin/loyalty-impact?tenantId=&window= — Impacto Loyalty of one
 * tenant: what its program shows with Cuik's own data only. Super-admin only
 * (not Equipo Cuik staff, not the merchant).
 */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const url = new URL(request.url)
    const tenantId = url.searchParams.get("tenantId") ?? ""
    if (!z.string().uuid().safeParse(tenantId).success)
      return errorResponse("Comercio inválido", 400)

    const view = await loadLoyaltyImpact(tenantId, askedWindow(url))
    if (!view) return errorResponse("Comercio no encontrado", 404)
    return successResponse(view)
  } catch (error) {
    console.error("[GET /api/admin/loyalty-impact]", error)
    return errorResponse("Internal server error", 500)
  }
}

const saveSchema = z.object({ tenantId: z.string().uuid(), settings: impactSettingsSchema })

/**
 * PUT /api/admin/loyalty-impact — saves the assumptions the super-admin set
 * for a tenant (share, its origin, margin, monthly fee and window).
 */
export async function PUT(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const parsed = saveSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Datos inválidos", 400, parsed.error.flatten())

    const saved = await saveImpactSettings(parsed.data.tenantId, parsed.data.settings)
    if (!saved) return errorResponse("Comercio no encontrado", 404)
    return successResponse(parsed.data.settings)
  } catch (error) {
    console.error("[PUT /api/admin/loyalty-impact]", error)
    return errorResponse("Internal server error", 500)
  }
}
