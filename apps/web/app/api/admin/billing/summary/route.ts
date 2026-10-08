import { billingDueRows, summarize } from "@/lib/admin/billing-overview"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Invoices to issue this week and overdue ones, for the tenant manager header. */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { dueSoon, overdue } = summarize(await billingDueRows())
    return successResponse({
      dueSoon: dueSoon.map(toRow),
      overdue: overdue.map(toRow),
    })
  } catch (error) {
    console.error("[GET /api/admin/billing/summary]", error)
    return errorResponse("Internal server error", 500)
  }
}

function toRow(r: Awaited<ReturnType<typeof billingDueRows>>[number]) {
  return {
    tenantId: r.tenantId,
    tenantName: r.tenantName,
    tenantSlug: r.tenantSlug,
    status: r.outlook.status,
    nextDue: r.outlook.nextDue,
    daysUntilNext: r.outlook.daysUntilNext,
    currentDue: r.outlook.currentDue,
    currentPeriod: r.outlook.currentPeriod,
    daysOverdue: r.outlook.daysOverdue,
    monthlyAmount: r.outlook.monthlyAmount,
    currency: r.outlook.currency,
  }
}
