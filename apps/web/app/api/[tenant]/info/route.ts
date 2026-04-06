import { and, db, eq, promotions } from "@cuik/db"
import { errorResponse, resolveTenant, successResponse } from "@/lib/api-utils"

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    // Get active promotion for this tenant
    const activePromos = await db
      .select()
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .limit(1)

    return successResponse({
      name: tenant.name,
      slug: tenant.slug,
      branding: tenant.branding,
      status: tenant.status,
      activePromotion: activePromos[0] ?? null,
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/info]", error)
    return errorResponse("Internal server error", 500)
  }
}
