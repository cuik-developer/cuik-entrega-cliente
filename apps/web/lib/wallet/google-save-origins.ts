/**
 * Origins allowed to open a Google "Save to Wallet" link.
 *
 * Google checks the page's referrer against the JWT's `origins`. Pages now
 * live on https://cuik.org (www redirects there since 20 Oct 2026), but links
 * may still be rendered from either host, so always allow both plus the
 * request's own origin (local dev, previews).
 */
export function googleSaveOrigins(requestOrigin?: string): string[] {
  const origins = ["https://cuik.org", "https://www.cuik.org"]
  if (requestOrigin && !origins.includes(requestOrigin)) origins.unshift(requestOrigin)
  return origins
}
