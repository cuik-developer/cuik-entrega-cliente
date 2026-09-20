import { and, db, eq, member, organization, promotions, tenants, user } from "@cuik/db"
import { type TenantBranding, tenantBrandingSchema } from "@cuik/shared/validators"
import { cookies } from "next/headers"

import { parseSaViewToken, SA_VIEW_COOKIE } from "@/lib/sa-view"

export type TenantContextData = {
  tenantId: string
  tenantSlug: string
  tenantName: string
  organizationId: string
  branding: TenantBranding | null
  timezone: string
  promotionType: "stamps" | "points" | null
  promotionId: string | null
  promotionConfig: Record<string, unknown> | null
  /** True when a super-admin is viewing this tenant ("ver como el comercio"). */
  readOnly: boolean
}

/**
 * Super-admin "ver como el comercio": tenant id from the encrypted cookie,
 * only if the user really is a super_admin. Null for everyone else.
 */
async function saViewedTenantId(userId: string): Promise<string | null> {
  try {
    const store = await cookies()
    const tenantId = parseSaViewToken(store.get(SA_VIEW_COOKIE)?.value)
    if (!tenantId) return null
    const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
    return u?.role === "super_admin" ? tenantId : null
  } catch {
    return null // cookies() unavailable outside a request scope
  }
}

export async function getTenantForUser(userId: string): Promise<TenantContextData | null> {
  const viewedTenantId = await saViewedTenantId(userId)

  let orgId = ""
  let tenantSlugToLoad: string | null = null
  if (!viewedTenantId) {
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
    orgId = org.orgId
    tenantSlugToLoad = org.orgSlug
  }

  // Find the tenant (by the org slug, or by id when a super-admin is viewing)
  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      branding: tenants.branding,
      timezone: tenants.timezone,
    })
    .from(tenants)
    .where(
      viewedTenantId ? eq(tenants.id, viewedTenantId) : eq(tenants.slug, tenantSlugToLoad ?? ""),
    )
    .limit(1)

  const tenant = tenantRows[0]
  if (!tenant) return null

  if (viewedTenantId) {
    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, tenant.slug))
      .limit(1)
    orgId = org?.id ?? ""
  }

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
    organizationId: orgId,
    branding,
    timezone: tenant.timezone,
    promotionType,
    promotionId: promo?.id ?? null,
    promotionConfig: (promo?.config as Record<string, unknown>) ?? null,
    readOnly: Boolean(viewedTenantId),
  }
}
