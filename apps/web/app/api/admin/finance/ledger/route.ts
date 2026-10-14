import { financeLedgerQuerySchema } from "@cuik/shared/validators"
import { buildFinanceDashboard } from "@/lib/admin/finance-dashboard"
import { buildFinanceExcel } from "@/lib/admin/finance-excel"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/**
 * The Tablero: month by month (cash and accrual), totals, break-even, loan
 * balances and the partner's investment recovery. `format=xlsx` downloads the
 * same figures as a workbook.
 */
export async function GET(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = financeLedgerQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const q = parsed.data
    const dashboard = await buildFinanceDashboard({
      from: q.from,
      to: q.to,
      ticket: q.ticket,
      includeProspects: q.prospects === "1",
    })
    if (q.format === "json") return successResponse(dashboard)
    const buffer = await buildFinanceExcel(dashboard)
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cuik-finanzas-${dashboard.range.from}-a-${dashboard.range.to}.xlsx"`,
      },
    })
  } catch (err) {
    console.error("[GET /api/admin/finance/ledger]", err)
    return errorResponse("Internal server error", 500)
  }
}
