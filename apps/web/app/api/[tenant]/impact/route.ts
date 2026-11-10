import { and, db, desc, eq, impactReports } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { buildImpactExcel } from "@/lib/loyalty/impact/excel"
import { ownerReport } from "@/lib/loyalty/impact/owner-view"
import { getReport } from "@/lib/loyalty/impact/store"

export const dynamic = "force-dynamic"

/**
 * GET /api/[tenant]/impact — the merchant's latest corte (owner or admin,
 * never the cashier), as the merchant may see it. `?format=xlsx` downloads
 * it. `{ report: null }` when Cuik has not loaded one yet.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const adminError = await requireTenantAdmin(session, tenant.id)
    if (adminError) return adminError

    const [latest] = await db
      .select({ id: impactReports.id })
      .from(impactReports)
      .where(and(eq(impactReports.tenantId, tenant.id)))
      .orderBy(desc(impactReports.computedAt))
      .limit(1)
    if (!latest) return successResponse({ report: null })

    const full = await getReport(latest.id, tenant.id)
    if (!full) return successResponse({ report: null })
    const report = ownerReport(full)

    if (new URL(request.url).searchParams.get("format") === "xlsx") {
      const buffer = await buildImpactExcel(report.summary, tenant.name)
      const safe = tenant.name.replace(/[^\w\s-]/g, "").trim() || "comercio"
      return new Response(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Impacto ${safe} - ${report.summary.period.to}.xlsx"`,
        },
      })
    }
    return successResponse({ report })
  } catch (error) {
    console.error("[GET /api/[tenant]/impact]", error)
    return errorResponse("Internal server error", 500)
  }
}
