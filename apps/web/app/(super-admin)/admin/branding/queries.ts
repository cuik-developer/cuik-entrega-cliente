import { db, eq, tenants } from "@cuik/db"
import type { TenantBranding } from "@cuik/shared/validators"
import { tenantBrandingSchema } from "@cuik/shared/validators"

/**
 * Public query — NO auth required.
 * Used by consumer pages (registro, bienvenido) to fetch tenant branding.
 * Only returns name + branding — no IDs, no sensitive data.
 */
export async function getTenantBySlug(
  slug: string,
): Promise<{ name: string; branding: TenantBranding | null } | null> {
  try {
    const [tenant] = await db
      .select({
        name: tenants.name,
        branding: tenants.branding,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1)

    if (!tenant) {
      return null
    }

    let branding: TenantBranding | null = null
    if (tenant.branding) {
      const parsed = tenantBrandingSchema.safeParse(tenant.branding)
      if (parsed.success) {
        branding = parsed.data
      }
    }

    return { name: tenant.name, branding }
  } catch (err) {
    console.error("[getTenantBySlug]", err)
    return null
  }
}
