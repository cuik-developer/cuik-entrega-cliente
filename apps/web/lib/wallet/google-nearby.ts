import type { WalletConfig } from "@cuik/shared/validators"
import { walletConfigSchema } from "@cuik/shared/validators"
import {
  buildGoogleClassId,
  type GoogleMerchantLocation,
  getGoogleAccessToken,
  setClassMerchantLocations,
} from "@cuik/wallet/google"
import { validateGoogleEnv } from "@cuik/wallet/shared"

/**
 * Google Wallet "nearby" notifications for a tenant: the same wallet
 * locations Apple gets (Geolocalizadas) go to its loyalty class as
 * `merchantLocations`. No locations means an empty list, which also clears
 * what Google had. Google decides radius, timing and text.
 */
export function googleMerchantLocations(walletConfig: unknown): GoogleMerchantLocation[] {
  const parsed = walletConfigSchema.safeParse(walletConfig ?? {})
  if (!parsed.success) return []
  return merchantLocationsOf(parsed.data)
}

function merchantLocationsOf(config: WalletConfig): GoogleMerchantLocation[] {
  return config.locations.slice(0, 10).map((l) => ({ latitude: l.lat, longitude: l.lng }))
}

export type GoogleNearbySyncResult =
  | { ok: true; skipped?: "google_disabled" | "class_missing" }
  | { ok: false; error: string }

/**
 * Push the tenant's merchant locations to its existing Google loyalty class.
 * A class that does not exist yet is skipped: it is created (with the same
 * locations) by the next design publish.
 */
export async function syncGoogleNearby(
  tenantName: string,
  walletConfig: WalletConfig,
): Promise<GoogleNearbySyncResult> {
  const googleConfig = validateGoogleEnv()
  if (!googleConfig) return { ok: true, skipped: "google_disabled" }
  try {
    const accessToken = await getGoogleAccessToken(googleConfig)
    const result = await setClassMerchantLocations({
      accessToken,
      classId: buildGoogleClassId(googleConfig.issuerId, tenantName),
      merchantLocations: merchantLocationsOf(walletConfig),
    })
    if (result.ok) return { ok: true }
    if (result.status === 404) return { ok: true, skipped: "class_missing" }
    return { ok: false, error: result.error }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
