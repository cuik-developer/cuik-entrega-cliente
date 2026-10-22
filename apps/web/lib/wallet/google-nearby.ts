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

export type GoogleNearbyStatus = {
  /** Google Wallet env configured on this server. */
  googleEnabled: boolean
  classId: string | null
  /** null when Google could not be asked (disabled or request failed). */
  classExists: boolean | null
  reviewStatus: string | null
  /** What Google has stored for the class right now. */
  googleLocations: GoogleMerchantLocation[]
  /** What Cuik would send (Geolocalizadas). */
  configuredLocations: GoogleMerchantLocation[]
  error: string | null
}

/**
 * Read-only check for the super-admin: asks Google which merchant locations
 * the tenant's loyalty class has, next to the ones configured in Cuik.
 */
export async function readGoogleNearbyStatus(
  tenantName: string,
  walletConfig: unknown,
): Promise<GoogleNearbyStatus> {
  const configuredLocations = googleMerchantLocations(walletConfig)
  const googleConfig = validateGoogleEnv()
  const base = {
    googleEnabled: Boolean(googleConfig),
    classId: googleConfig ? buildGoogleClassId(googleConfig.issuerId, tenantName) : null,
    classExists: null,
    reviewStatus: null,
    googleLocations: [],
    configuredLocations,
    error: null,
  }
  if (!googleConfig || !base.classId) return base
  try {
    const accessToken = await getGoogleAccessToken(googleConfig)
    const res = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${base.classId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (res.status === 404) return { ...base, classExists: false }
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ...base, error: `Google respondió ${res.status} ${text.slice(0, 200)}` }
    }
    const body = (await res.json()) as {
      reviewStatus?: string
      merchantLocations?: { latitude?: number; longitude?: number }[]
    }
    return {
      ...base,
      classExists: true,
      reviewStatus: body.reviewStatus ?? null,
      googleLocations: (body.merchantLocations ?? [])
        .filter((l) => typeof l.latitude === "number" && typeof l.longitude === "number")
        .map((l) => ({ latitude: l.latitude as number, longitude: l.longitude as number })),
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}
