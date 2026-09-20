import { and, db, eq, promotions, tenants } from "@cuik/db"
import type { RegistrationConfig, TenantBranding } from "@cuik/shared/validators"
import { registrationConfigSchema, tenantBrandingSchema } from "@cuik/shared/validators"
import { notFound } from "next/navigation"
import RegistroClient from "./registro-client"

const DEFAULT_PRIMARY = "#0e70db"
const DEFAULT_ACCENT = "#ff4810"

/**
 * Fetch tenant data for registration page.
 * Returns name + branding + registrationConfig.
 * Public query — no auth required.
 */
async function getTenantForRegistration(slug: string): Promise<{
  name: string
  branding: TenantBranding | null
  registrationConfig: RegistrationConfig | null
  promotionType: "stamps" | "points" | null
} | null> {
  try {
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        branding: tenants.branding,
        registrationConfig: tenants.registrationConfig,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1)

    if (!tenant) return null

    let branding: TenantBranding | null = null
    if (tenant.branding) {
      const parsed = tenantBrandingSchema.safeParse(tenant.branding)
      if (parsed.success) branding = parsed.data
    }

    let registrationConfig: RegistrationConfig | null = null
    if (tenant.registrationConfig) {
      const parsed = registrationConfigSchema.safeParse(tenant.registrationConfig)
      if (parsed.success) registrationConfig = parsed.data
    }

    // Active promotion type decides how the marketing bonus is worded (sellos vs puntos).
    const [activePromotion] = await db
      .select({ type: promotions.type })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .orderBy(promotions.createdAt)
      .limit(1)
    const promotionType =
      activePromotion?.type === "points" || activePromotion?.type === "stamps"
        ? activePromotion.type
        : null

    return { name: tenant.name, branding, registrationConfig, promotionType }
  } catch (err) {
    console.error("[getTenantForRegistration]", err)
    return null
  }
}

export default async function TenantRegistroPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params

  const tenant = await getTenantForRegistration(slug)
  if (!tenant) {
    notFound()
  }

  return (
    <RegistroClient
      slug={slug}
      tenantName={tenant.name}
      primaryColor={tenant.branding?.primaryColor ?? DEFAULT_PRIMARY}
      accentColor={tenant.branding?.accentColor ?? DEFAULT_ACCENT}
      logoUrl={tenant.branding?.logoUrl ?? null}
      registrationConfig={tenant.registrationConfig}
      promotionType={tenant.promotionType}
    />
  )
}
