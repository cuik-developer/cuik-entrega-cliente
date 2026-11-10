import { z } from "zod"

/**
 * Features Cuik turns on per tenant from the super-admin (tenants.features).
 * The merchant reads them but can never write them. Everything is off unless
 * set to true.
 */
export const tenantFeaturesSchema = z.object({
  /** Owner and admins get "Cajero" (Escanear / Buscar / Historial) in their menu. */
  adminCashier: z.boolean().optional(),
})
export type TenantFeatures = z.infer<typeof tenantFeaturesSchema>

/** Reads the stored JSON safely: anything unexpected counts as "off". */
export function parseTenantFeatures(raw: unknown): Required<TenantFeatures> {
  const parsed = tenantFeaturesSchema.safeParse(raw ?? {})
  return { adminCashier: parsed.success ? parsed.data.adminCashier === true : false }
}
