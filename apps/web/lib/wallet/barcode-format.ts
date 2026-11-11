import { db, eq, tenants } from "@cuik/db"
import { parseTenantFeatures } from "@cuik/shared/validators"
import type { BarcodeFormat } from "@cuik/wallet/shared"

/**
 * Code on the tenant's wallet passes: "qr" (default) or "code128", chosen by
 * the super-admin (tenants.features.barcodeFormat). Any read error keeps the QR.
 */
export async function tenantBarcodeFormat(tenantId: string): Promise<BarcodeFormat> {
  try {
    const [row] = await db
      .select({ features: tenants.features })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    return parseTenantFeatures(row?.features).barcodeFormat
  } catch {
    return "qr"
  }
}
