import { and, clients, db, desc, eq, impactReports, inArray, sql } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import type { ImpactSummary } from "@/lib/loyalty/impact/types"

/**
 * GET /api/[tenant]/impact/segment?kind=broken — the client ids behind a
 * list of the latest corte, to start a campaign with them. "broken" = card
 * holders whose frequency broke (the only list made of the merchant's own
 * Cuik clients; frequent buyers without a card have no pass to message).
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

    const kind = new URL(request.url).searchParams.get("kind")
    if (kind !== "broken") return errorResponse("Unknown segment", 400)

    const [latest] = await db
      .select({ summary: impactReports.summary, periodTo: impactReports.periodTo })
      .from(impactReports)
      .where(eq(impactReports.tenantId, tenant.id))
      // The corte covering the latest period, same choice as the panel's Impacto page.
      .orderBy(desc(impactReports.periodTo), desc(impactReports.computedAt))
      .limit(1)
    if (!latest) return successResponse({ clientIds: [], count: 0, periodTo: null })

    const summary = latest.summary as ImpactSummary
    const dnis = [...new Set(summary.brokenFrequency.list.filter((b) => b.registered).map((b) => b.dni))]
    if (dnis.length === 0) return successResponse({ clientIds: [], count: 0, periodTo: String(latest.periodTo) })

    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.tenantId, tenant.id),
          inArray(sql`regexp_replace(coalesce(${clients.dni}, ''), '\\D', '', 'g')`, dnis),
          sql`${clients.status} IN ('active', 'inactive')`,
        ),
      )
    const clientIds = rows.map((r) => r.id)
    return successResponse({ clientIds, count: clientIds.length, periodTo: String(latest.periodTo) })
  } catch (error) {
    console.error("[GET /api/[tenant]/impact/segment]", error)
    return errorResponse("Internal server error", 500)
  }
}
