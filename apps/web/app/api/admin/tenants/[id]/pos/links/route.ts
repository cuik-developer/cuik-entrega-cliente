import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { csvCell } from "@/lib/csv"
import { linksReview } from "@/lib/pos/links-review"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YM = /^(\d{4}-\d{2}|all)$/

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/tenants/[id]/pos/links?month=YYYY-MM[&format=csv]
 * Validación de enlaces: the month's stamps without a POS sale (with the
 * sales nearby that could be theirs) and the links the matcher inferred.
 * `format=csv` downloads the stamps without sale for a review outside Cuik.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const url = new URL(request.url)
    const month = url.searchParams.get("month") ?? ""
    if (!YM.test(month)) return errorResponse("Mes inválido", 400)
    const review = await linksReview(id, month)
    if (!review) return errorResponse("Tenant not found", 404)

    if (url.searchParams.get("format") === "csv") {
      const tz = review.timezone
      const when = (iso: string) =>
        new Date(iso).toLocaleString("es-PE", {
          timeZone: tz,
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      const head = [
        "Fecha",
        "Cliente",
        "DNI",
        "Celular",
        "Tienda",
        "Monto sello",
        "Cajero",
        "Sugerencia",
        "Venta candidata",
        "Monto venta",
        "Documento en venta",
        "Minutos",
        "visita_id",
        "venta_id",
      ]
      const label = { link: "Enlazar", review: "Revisar", none: "No" }
      const lines = review.unlinked.map((v) => {
        const c = v.candidates[0]
        return [
          when(v.createdAt),
          v.clientName,
          v.dni ?? "",
          v.phone ?? "",
          v.location ?? "",
          v.amount == null ? "" : String(v.amount),
          v.registeredBy ?? "",
          label[v.suggestion],
          c ? `${c.orderRef ?? ""} ${when(c.soldAt)}`.trim() : "",
          c ? String(c.amount) : "",
          c ? (c.dni ?? "invitado") : "",
          c ? String(c.minutes) : "",
          v.visitId,
          c?.saleId ?? "",
        ]
          .map(csvCell)
          .join(",")
      })
      return new Response(`﻿${[head.map(csvCell).join(","), ...lines].join("\r\n")}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Registros sin venta ${month === "all" ? "todo" : month}.csv"`,
        },
      })
    }
    return successResponse(review)
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/pos/links]", error)
    return errorResponse("Internal server error", 500)
  }
}
