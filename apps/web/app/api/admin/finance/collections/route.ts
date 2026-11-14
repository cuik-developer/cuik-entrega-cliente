import { loadCollections } from "@/lib/admin/collections-data"
import { requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

/** Finanzas › Cobranza: invoices to issue, receivables by age and recent payments. */
export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    return successResponse(await loadCollections())
  } catch (err) {
    console.error("[GET /api/admin/finance/collections]", err)
    return errorResponse("Internal server error", 500)
  }
}
