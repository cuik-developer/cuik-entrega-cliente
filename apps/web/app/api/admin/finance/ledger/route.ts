import { financeLedgerQuerySchema } from "@cuik/shared/validators"
import { buildFinanceDashboard } from "@/lib/admin/finance-dashboard"
import { buildFinanceExcel } from "@/lib/admin/finance-excel"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireSuperAdminOr,
  successResponse,
} from "@/lib/api-utils"

/**
 * The Tablero: month by month (cash and accrual), totals, break-even, loan
 * balances and the partner's investment recovery. `format=xlsx` downloads the
 * same figures as a workbook.
 *
 * Equipo Cuik with "Finanzas › Tablero (ver)" reads it on screen (JSON only);
 * the Excel download stays with the owner (decision 17 Nov 2026).
 */
export async function GET(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const parsed = financeLedgerQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const q = parsed.data
    // The owner keeps the usual check (it also requires the authenticator app);
    // staff get the screen only, and adminAccessOf denies them without 2FA.
    const accessError =
      q.format === "json" && session.user.role === "staff"
        ? await requireSuperAdminOr(session, "finance_dashboard")
        : requireRole(session, "super_admin")
    if (accessError) return accessError
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
