import { db, eq, tenants } from "@cuik/db"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { purchaseAnalytics } from "@/lib/pos/purchases"
import { buildPurchasesExcel } from "@/lib/pos/purchases-excel"
import { exportFileName, parsePurchaseParams } from "@/lib/pos/purchases-params"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** GET /api/admin/tenants/[id]/purchases?from&to&store&cuik=1[&format=xlsx] — the same analysis and export for Cuik. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const url = new URL(request.url)
    const parsed = await parsePurchaseParams(url, tenant.id)
    if ("error" in parsed) return errorResponse(parsed.error, 400)
    const analytics = await purchaseAnalytics(tenant.id, parsed.filters)
    if (url.searchParams.get("format") === "xlsx") {
      const { buffer } = await buildPurchasesExcel({
        tenantId: tenant.id,
        tenantName: tenant.name,
        timezone: parsed.timezone,
        filters: parsed.filters,
        analytics,
      })
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${exportFileName(tenant.name, parsed.filters)}"`,
        },
      })
    }
    return successResponse(analytics)
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/purchases]", error)
    return errorResponse("Internal server error", 500)
  }
}
