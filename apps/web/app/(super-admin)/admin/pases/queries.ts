import { db, desc, eq, passAssets, passDesigns, promotions, tenants } from "@cuik/db"

export async function getDesignById(id: string) {
  const results = await db.select().from(passDesigns).where(eq(passDesigns.id, id)).limit(1)

  const design = results[0] ?? null
  if (!design) return null

  const assets = await db.select().from(passAssets).where(eq(passAssets.designId, id))

  return { design, assets }
}

export async function listDesignsByTenant(tenantId?: string) {
  const query = db
    .select({
      design: passDesigns,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      promotionType: promotions.type,
      promotionName: promotions.rewardValue,
      promotionActive: promotions.active,
    })
    .from(passDesigns)
    .innerJoin(tenants, eq(passDesigns.tenantId, tenants.id))
    .leftJoin(promotions, eq(passDesigns.promotionId, promotions.id))
    .orderBy(desc(passDesigns.updatedAt))

  if (tenantId) {
    return query.where(eq(passDesigns.tenantId, tenantId))
  }

  return query
}

export async function getDesignAssets(designId: string) {
  return db.select().from(passAssets).where(eq(passAssets.designId, designId))
}
