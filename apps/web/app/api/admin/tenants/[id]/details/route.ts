import { db, desc, eq, locations, passDesigns, promotions, sql, tenants } from "@cuik/db"
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
        .select({
          registrationConfig: tenants.registrationConfig,
          appleConfig: tenants.appleConfig,
          slug: tenants.slug,
        })
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

    // Onboarding checklist: what the Cuik team still has to set up before
    // handing the tenant over (mirrors "Fase 2" of the SA guide).
    const slug = tenantRows[0]?.slug ?? ""
    const teamRes = await db.execute<{ cashiers: number; admins: number; clients: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM organization o JOIN member m ON m.organization_id = o.id
          WHERE o.slug = ${slug} AND m.role NOT IN ('owner', 'admin')) AS cashiers,
        (SELECT count(*)::int FROM organization o JOIN member m ON m.organization_id = o.id
          WHERE o.slug = ${slug} AND m.role IN ('owner', 'admin')) AS admins,
        (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = ${id}) AS clients`)
    const team = teamRes.rows[0]
    const appleMode = (tenantRows[0]?.appleConfig as { mode?: string } | null)?.mode ?? null
    const activePromo = promotionsList.find((p) => p.active) ?? null
    const checklist = {
      activePromotion: activePromo ? { type: activePromo.type } : null,
      activePromotionCount: promotionsList.filter((p) => p.active).length,
      designPublished: designRows.some((d) => d.isActive),
      appleMode,
      googleConfigured: Boolean(
        process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SA_JSON_B64,
      ),
      registrationBonus: regConfig?.marketingBonus?.enabled ?? false,
      birthdayAsked: regConfig?.birthday?.enabled ?? false,
      locations: locationRows.filter((l) => l.active).length,
      cashiers: Number(team?.cashiers ?? 0),
      admins: Number(team?.admins ?? 0),
      clients: Number(team?.clients ?? 0),
    }

    return successResponse({
      promotions: promotionsList,
      registrationConfig: regConfig,
      locations: locationRows,
      checklist,
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/details]", error)
    return errorResponse("Internal server error", 500)
  }
}
