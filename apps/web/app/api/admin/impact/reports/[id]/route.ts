import { db, eq, tenants } from "@cuik/db"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { buildImpactExcel } from "@/lib/loyalty/impact/excel"
import { getReport } from "@/lib/loyalty/impact/store"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/impact/reports/[id]?tenantId= — the corte (with the previous
 * one for comparison). With `format=xlsx`, the workbook instead.
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
    if (!UUID.test(id) || !UUID.test(tenantId)) return errorResponse("Invalid ID", 400)

    const report = await getReport(id, tenantId)
    if (!report) return errorResponse("Corte no encontrado", 404)

    if (url.searchParams.get("format") === "xlsx") {
      const [tenant] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
      const name = tenant?.name ?? "Comercio"
      const buffer = await buildImpactExcel(report.summary, name)
      const safe = name.replace(/[^\w\s-]/g, "").trim() || "comercio"
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Impacto ${safe} - ${report.summary.period.to}.xlsx"`,
        },
      })
    }
    return successResponse(report)
  } catch (error) {
    console.error("[GET /api/admin/impact/reports/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
