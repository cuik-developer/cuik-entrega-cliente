import { financeMonthSchema } from "@cuik/shared/validators"
import { loadDocumentsPage } from "@/lib/admin/documents-data"
import { buildDocumentsExcel } from "@/lib/admin/documents-excel"
import { requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

/** Registro de ventas / compras of ?direction=sale|purchase&month=YYYY-MM as Excel. */
export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const url = new URL(request.url)
    const direction = url.searchParams.get("direction")
    const month = url.searchParams.get("month") ?? ""
    if (direction !== "sale" && direction !== "purchase") {
      return errorResponse("direction inválido", 400)
    }
    if (!financeMonthSchema.safeParse(month).success) return errorResponse("Mes inválido", 400)
    const buf = await buildDocumentsExcel(await loadDocumentsPage(direction, month))
    const name = `${direction === "sale" ? "ventas" : "compras"}-cuik-${month}.xlsx`
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    console.error("[GET /api/admin/finance/documents/export]", err)
    return errorResponse("Internal server error", 500)
  }
}
