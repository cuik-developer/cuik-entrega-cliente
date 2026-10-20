import { z } from "zod"

// ── Hex color validator ──────────────────────────────────────────────
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (#RRGGBB)")

// ── Own asset URLs ───────────────────────────────────────────────────
// Branding images must be files we serve ourselves: the upload endpoint
// returns `/api/assets/<key>` (getPublicUrl), and older rows may hold the
// absolute form on cuik.org / www.cuik.org. Anything else (another host,
// javascript:, data:, protocol-relative //host) is rejected.
const ASSET_PATH = "/api/assets/"
const OWN_ASSET_ORIGINS = ["https://cuik.org", "https://www.cuik.org"]
const MAX_ASSET_URL_LENGTH = 512

/** True when `url` is one of our own `/api/assets/...` files (relative or on cuik.org). */
export function isOwnAssetUrl(url: string): boolean {
  if (url.length > MAX_ASSET_URL_LENGTH) return false
  let path = url
  const origin = OWN_ASSET_ORIGINS.find((o) => url.startsWith(`${o}/`))
  if (origin) path = url.slice(origin.length)
  if (!path.startsWith(ASSET_PATH) || path.length === ASSET_PATH.length) return false
  if (path.includes("..") || path.includes("//") || path.includes("?") || path.includes("#")) {
    return false
  }
  return /^[A-Za-z0-9/._~%-]+$/.test(path)
}

const OWN_ASSET_MESSAGE = "La imagen debe subirse a Cuik (/api/assets/...)"

/** Strict: for writes. */
const ownAssetUrlSchema = z.string().min(1).refine(isOwnAssetUrl, OWN_ASSET_MESSAGE)

/**
 * Lenient: for reads of stored rows. A stored value that is not one of our
 * assets is dropped (null) instead of failing the whole branding object, so
 * the tenant keeps its colors even if an old row holds a foreign URL.
 */
const storedAssetUrlSchema = z
  .string()
  .nullable()
  .default(null)
  .transform((u) => (u && isOwnAssetUrl(u) ? u : null))
  .catch(null)

// ── Tenant branding schema ──────────────────────────────────────────
/** Validates branding a user saves: image URLs must be our own assets. */
export const tenantBrandingInputSchema = z.object({
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  logoUrl: ownAssetUrlSchema.nullable().default(null),
  /** Square mark (isotipo) for small spots such as the panel top bar; the logo is used when absent. */
  iconUrl: ownAssetUrlSchema.nullable().default(null),
})

/** Parses stored branding: same shape, foreign image URLs read as null. */
export const tenantBrandingSchema = tenantBrandingInputSchema.extend({
  logoUrl: storedAssetUrlSchema,
  iconUrl: storedAssetUrlSchema,
})

export type TenantBranding = z.infer<typeof tenantBrandingInputSchema>
