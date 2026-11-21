import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { buildCampaignClientsExcel } from "@/lib/loyalty/loyalty-impact/excel"
import { loadCampaignClients } from "@/lib/loyalty/loyalty-impact/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET /api/admin/loyalty-impact/campaigns/[id]?tenantId=&window=[&format=xlsx]
 * The client-by-client list of one campaign: how each client was on the send
 * day and what they did after. Carries names, so super-admin only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    const url = new URL(request.url)
    const tenantId = url.searchParams.get("tenantId") ?? ""
    const uuid = z.string().uuid()
    if (!uuid.safeParse(id).success || !uuid.safeParse(tenantId).success) {
      return errorResponse("Campaña inválida", 400)
    }
    const raw = url.searchParams.get("window")
    const asked = raw !== null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null

    const view = await loadCampaignClients(tenantId, id, asked)
    if (!view) return errorResponse("Campaña no encontrada", 404)

    if (url.searchParams.get("format") === "xlsx") {
      const buffer = await buildCampaignClientsExcel(view)
      const safe = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-") || "campana"
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="impacto-${safe(view.tenantName)}-${safe(view.campaign.name)}-${view.campaign.sentOn}.xlsx"`,
        },
      })
    }
    return successResponse(view)
  } catch (error) {
    console.error("[GET /api/admin/loyalty-impact/campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
