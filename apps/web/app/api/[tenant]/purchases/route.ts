import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { purchaseAnalytics } from "@/lib/pos/purchases"
import { buildPurchasesExcel } from "@/lib/pos/purchases-excel"
import { exportFileName, parsePurchaseParams } from "@/lib/pos/purchases-params"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET /api/[tenant]/purchases?from&to&store&cuik=1[&format=xlsx]
 * Análisis de compras of the merchant (owner or admin): categories, brands,
 * products, trend. `format=xlsx` downloads the purchases of the period (the
 * super-admin read-only view cannot download).
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

    const url = new URL(request.url)
    const wantsFile = url.searchParams.get("format") === "xlsx"
    if (wantsFile && session.saViewTenantId) return errorResponse("Modo solo lectura", 403)
    const parsed = await parsePurchaseParams(url, tenant.id)
    if ("error" in parsed) return errorResponse(parsed.error, 400)
    const analytics = await purchaseAnalytics(tenant.id, parsed.filters)

    if (wantsFile) {
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
    console.error("[GET /api/[tenant]/purchases]", error)
    return errorResponse("Internal server error", 500)
  }
}
