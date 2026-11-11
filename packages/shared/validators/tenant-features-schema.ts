import { z } from "zod"

/**
 * Features Cuik turns on per tenant from the super-admin (tenants.features).
 * The merchant reads them but can never write them. Everything is off unless
 * set to true.
 */
export const tenantFeaturesSchema = z.object({
  /** Owner and admins get "Cajero" (Escanear / Buscar / Historial) in their menu. */
  adminCashier: z.boolean().optional(),
  /** Code on the wallet pass: "qr" (default) or "code128" for stores with a barcode gun. */
  barcodeFormat: z.enum(["qr", "code128"]).optional(),
})
export type TenantFeatures = z.infer<typeof tenantFeaturesSchema>

/** Reads the stored JSON safely: anything unexpected counts as "off". */
export function parseTenantFeatures(raw: unknown): Required<TenantFeatures> {
  const parsed = tenantFeaturesSchema.safeParse(raw ?? {})
  const data = parsed.success ? parsed.data : {}
  return {
    adminCashier: data.adminCashier === true,
    barcodeFormat: data.barcodeFormat === "code128" ? "code128" : "qr",
  }
}
