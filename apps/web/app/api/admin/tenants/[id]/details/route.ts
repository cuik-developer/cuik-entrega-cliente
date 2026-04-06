import { db, desc, eq, locations, passDesigns, promotions, tenants } from "@cuik/db"
import { registrationConfigSchema } from "@cuik/shared/validators"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/**
 * GET /api/admin/tenants/[id]/details
 * Returns promotion + registration config for a tenant in a single request.
 * Used by the SA tenant detail modal to avoid multiple server action calls.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params

    // Fetch promotion, tenant config, and locations in parallel
    const [promoRows, tenantRows, locationRows] = await Promise.all([
      db
        .select()
        .from(promotions)
        .where(eq(promotions.tenantId, id))
        .orderBy(desc(promotions.createdAt)),
      db
        .select({ registrationConfig: tenants.registrationConfig })
        .from(tenants)
        .where(eq(tenants.id, id))
        .limit(1),
      db
        .select({
          id: locations.id,
          name: locations.name,
          address: locations.address,
          active: locations.active,
        })
        .from(locations)
        .where(eq(locations.tenantId, id)),
    ])

    // Find pass designs linked to each promotion
    const designRows = await db
      .select({
        id: passDesigns.id,
        promotionId: passDesigns.promotionId,
        isActive: passDesigns.isActive,
      })
      .from(passDesigns)
      .where(eq(passDesigns.tenantId, id))

    const designByPromo = new Map<string, string>()
    for (const d of designRows) {
      if (d.promotionId) designByPromo.set(d.promotionId, d.id)
    }

    const promotionsList = promoRows.map((row) => ({
      id: row.id,
      type: row.type,
      maxVisits: row.maxVisits,
      rewardValue: row.rewardValue,
      active: row.active,
      config: row.config,
      createdAt: row.createdAt,
      passDesignId: designByPromo.get(row.id) ?? null,
    }))

    const rawConfig = tenantRows[0]?.registrationConfig
    const regConfig = rawConfig
      ? (registrationConfigSchema.safeParse(rawConfig).data ?? null)
      : null

    return successResponse({
      promotions: promotionsList,
      registrationConfig: regConfig,
      locations: locationRows,
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/details]", error)
    return errorResponse("Internal server error", 500)
  }
}
