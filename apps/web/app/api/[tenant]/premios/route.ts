import { and, asc, db, eq, promotions, rewardCatalog } from "@cuik/db"

import { errorResponse, resolveTenant, successResponse } from "@/lib/api-utils"

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    // No auth required — public endpoint

    // Check for active points promotion
    const promoRows = await db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenant.id),
          eq(promotions.type, "points"),
          eq(promotions.active, true),
        ),
      )
      .limit(1)

    if (!promoRows[0]) {
      return errorResponse("No points promotion active", 404)
    }

    // Fetch active catalog items ordered by sortOrder
    const items = await db
      .select({
        id: rewardCatalog.id,
        name: rewardCatalog.name,
        description: rewardCatalog.description,
        imageUrl: rewardCatalog.imageUrl,
        pointsCost: rewardCatalog.pointsCost,
        category: rewardCatalog.category,
      })
      .from(rewardCatalog)
      .where(and(eq(rewardCatalog.tenantId, tenant.id), eq(rewardCatalog.active, true)))
      .orderBy(asc(rewardCatalog.sortOrder))

    // Build config from tenant branding
    const branding = (tenant.branding ?? {}) as Record<string, unknown>

    return successResponse({
      items,
      config: {
        tenantName: tenant.name,
        logoUrl: branding.logoUrl ?? null,
        primaryColor: branding.primaryColor ?? null,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/premios]", error)
    return errorResponse("Internal server error", 500)
  }
}
