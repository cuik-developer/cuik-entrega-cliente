import ExcelJS from "exceljs"
import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
} from "@/lib/api-utils"
import { addCumulativeSheets } from "@/lib/reports/build-excel"
import { computeCumulativeUntil } from "@/lib/reports/compute-report"

const querySchema = z.object({
  /** "YYYY-MM": the cumulative picture up to the end of this month. */
  until: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/**
 * GET /api/[tenant]/reports/export?until=YYYY-MM
 * On-demand all-time Excel: totals since the business started, month by
 * month, top 20 clients and today's segments. No contact data.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success)
      return errorResponse("Invalid query parameters", 400, parsed.error.flatten())

    const {
      tenant: t,
      until,
      cumulative,
    } = await computeCumulativeUntil(tenant.id, parsed.data.until)
    const wb = new ExcelJS.Workbook()
    wb.creator = "Cuik"
    addCumulativeSheets(wb, cumulative, { tenant: t }, t.timezone)
    const buffer = Buffer.from(await wb.xlsx.writeBuffer())

    return new Response(buffer, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${t.slug}-acumulado-hasta-${until.key}.xlsx"`,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/reports/export]", error)
    return errorResponse("Internal server error", 500)
  }
}
