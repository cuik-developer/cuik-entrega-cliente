/**
 * Google Wallet hero image of a design.
 *
 * Google shows one static banner (class `heroImage`, object image module).
 * A design may carry its own Google-only image (`pass_assets.type =
 * 'google_hero'`, ideally 1032×336); without it Google keeps using the Apple
 * strip background exactly as before. No stamps are drawn on it.
 *
 * `google_hero` is added to the `asset_type` enum by migration 0033; the
 * Drizzle enum in packages/db/schema/passes.ts does not list it yet, hence the
 * plain string here.
 */
export const GOOGLE_HERO_ASSET_TYPE = "google_hero"

/** The asset row Google should use as hero: google_hero first, else strip_bg. */
export function pickGoogleHeroAsset<T extends { type: string; url: string }>(
  rows: readonly T[],
): T | undefined {
  return (
    rows.find((a) => a.type === GOOGLE_HERO_ASSET_TYPE && a.url) ??
    rows.find((a) => a.type === "strip_bg")
  )
}
