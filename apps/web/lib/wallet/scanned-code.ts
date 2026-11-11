/**
 * What the cashier screens receive from a gun or the camera reading a Code 128:
 * the 12 hex chars of `cuik:<slug>:<hex>`. Rebuild the full code; anything
 * else (a QR, a typed code, a migrated client's code) passes through untouched.
 * Client-safe (no DB).
 */
export function expandScannedCode(raw: string, tenantSlug: string): string {
  const code = raw.trim()
  return /^[0-9a-f]{12}$/i.test(code) && tenantSlug
    ? `cuik:${tenantSlug}:${code.toLowerCase()}`
    : code
}
