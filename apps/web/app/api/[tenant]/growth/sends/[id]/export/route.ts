import { errorResponse } from "@/lib/api-utils"
import { csvCell } from "@/lib/csv"
import { growthContext, UUID } from "@/lib/growth/route-utils"
import { exportRows, getSend } from "@/lib/growth/sends"

export const dynamic = "force-dynamic"

/**
 * GET /api/[tenant]/growth/sends/[id]/export — CSV (name, phone, message)
 * of the clients still to contact, for a bulk WhatsApp tool. Marking them
 * "Enviado" stays manual: only the check starts attribution.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const g = await growthContext(request, params)
    if (!g.ok) return g.response
    if (g.ctx.readOnly) return errorResponse("La vista de solo lectura no descarga datos", 403)
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Envío no encontrado", 404)
    const send = await getSend(g.ctx.tenant, id)
    if (!send) return errorResponse("Envío no encontrado", 404)
    const lines = [
      ["Nombre", "Celular", "Mensaje"].map(csvCell).join(","),
      ...exportRows(send).map((r) => [r.name, r.phone, r.message].map(csvCell).join(",")),
    ]
    const safe = send.name.replace(/[^\w\s.·-]/g, "").trim() || "envio"
    return new Response(`﻿${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Cuik Growth - ${safe}.csv"`,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/growth/sends/[id]/export]", error)
    return errorResponse("Internal server error", 500)
  }
}
