import { and, db, eq, member, organization, promotions, tenants } from "@cuik/db"
import { type TenantBranding, tenantBrandingSchema } from "@cuik/shared/validators"

export async function getTenantForUser(userId: string): Promise<{
  tenantId: string
  tenantSlug: string
  tenantName: string
  organizationId: string
  branding: TenantBranding | null
  timezone: string
  promotionType: "stamps" | "points" | null
  promotionId: string | null
  promotionConfig: Record<string, unknown> | null
} | null> {
  // Find the user's organization membership
  const memberRows = await db
    .select({
      orgId: organization.id,
      orgSlug: organization.slug,
      orgName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .limit(1)

  const org = memberRows[0]
  if (!org) return null

  // Find the tenant matching this organization slug
  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      branding: tenants.branding,
      timezone: tenants.timezone,
    })
    .from(tenants)
    .where(eq(tenants.slug, org.orgSlug))
    .limit(1)

  const tenant = tenantRows[0]
  if (!tenant) return null

  // Parse branding JSONB — fallback to null if invalid or missing
  const brandingResult = tenantBrandingSchema.safeParse(tenant.branding)
  const branding: TenantBranding | null = brandingResult.success ? brandingResult.data : null

  // Find active promotion for this tenant
  const promoRows = await db
    .select({
      id: promotions.id,
      type: promotions.type,
      config: promotions.config,
    })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
    .limit(1)

  const promo = promoRows[0]
  const promotionType = promo?.type === "stamps" || promo?.type === "points" ? promo.type : null

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    organizationId: org.orgId,
    branding,
    timezone: tenant.timezone,
    promotionType,
    promotionId: promo?.id ?? null,
    promotionConfig: (promo?.config as Record<string, unknown>) ?? null,
  }
}
