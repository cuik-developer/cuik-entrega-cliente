import { db, eq, tenantBilling, tenants } from "@cuik/db"
import { isPrivacyIdentityComplete } from "./shared"

export {
  isPrivacyIdentityComplete,
  PRIVACY_NOTICE_UPDATED,
  PRIVACY_NOTICE_VERSION,
  preferencesPath,
  privacyNoticePath,
} from "./shared"

/**
 * Who answers for a program's client data: the merchant is the titular of the
 * bank (Ley 29733) and Cuik the encargado. The legal identity comes from the
 * super-admin billing data; without it the notice falls back to the trade name
 * and the super-admin shows an alert (`complete: false`).
 */
export type MerchantPrivacyIdentity = {
  tenantId: string
  slug: string
  /** Trade name, as the client sees it on the pass. */
  name: string
  razonSocial: string | null
  ruc: string | null
  direccion: string | null
  /** Where the client writes to exercise ARCO rights; null = only through Cuik. */
  contactEmail: string | null
  complete: boolean
}

/**
 * The tenant behind a program's privacy pages, whatever its status: a client
 * must be able to read the notice and withdraw consent even if the merchant's
 * account is suspended. The preferences page and both of its routes use this.
 */
export async function privacyTenant(
  slug: string,
): Promise<{ id: string; name: string; branding: unknown } | null> {
  const [row] = await db
    .select({ id: tenants.id, name: tenants.name, branding: tenants.branding })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)
  return row ?? null
}

export async function merchantPrivacyIdentity(
  slug: string,
): Promise<MerchantPrivacyIdentity | null> {
  const [row] = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      contactEmail: tenants.contactEmail,
      razonSocial: tenantBilling.razonSocial,
      ruc: tenantBilling.ruc,
      direccion: tenantBilling.direccionFiscal,
    })
    .from(tenants)
    .leftJoin(tenantBilling, eq(tenantBilling.tenantId, tenants.id))
    .where(eq(tenants.slug, slug))
    .limit(1)
  if (!row) return null
  const clean = (v: string | null) => (v?.trim() ? v.trim() : null)
  const identity = {
    razonSocial: clean(row.razonSocial),
    ruc: clean(row.ruc),
    direccion: clean(row.direccion),
  }
  return {
    tenantId: row.tenantId,
    slug: row.slug,
    name: row.name,
    ...identity,
    contactEmail: clean(row.contactEmail),
    complete: isPrivacyIdentityComplete(identity),
  }
}
