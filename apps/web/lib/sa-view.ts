import { decrypt, encrypt } from "@/lib/encryption"

/**
 * "Ver como el comercio": a super-admin can open a tenant's panel read-only.
 *
 * The grant is an httpOnly cookie holding an AES-GCM token (ENCRYPTION_KEY)
 * with the tenant id and an expiry. It is only honoured when the session
 * role is `super_admin` (api-utils / tenant-context), and the middleware
 * rejects every non-GET tenant API call while the cookie is present, so the
 * view is read-only by construction.
 */
export const SA_VIEW_COOKIE = "sa_view_tenant"
export const SA_VIEW_TTL_SECONDS = 60 * 60

type Payload = { t: string; exp: number }

export function createSaViewToken(tenantId: string, ttlSeconds = SA_VIEW_TTL_SECONDS): string {
  const payload: Payload = { t: tenantId, exp: Date.now() + ttlSeconds * 1000 }
  return encrypt(JSON.stringify(payload))
}

/** Tenant id inside a valid, unexpired token; null otherwise (never throws). */
export function parseSaViewToken(token: string | null | undefined): string | null {
  if (!token) return null
  try {
    const payload = JSON.parse(decrypt(token)) as Partial<Payload>
    if (typeof payload.t !== "string" || typeof payload.exp !== "number") return null
    if (payload.exp < Date.now()) return null
    return payload.t
  } catch {
    return null
  }
}

/** Reads the cookie out of a raw `Cookie` header. */
export function saViewTenantFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null
  const part = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SA_VIEW_COOKIE}=`))
  if (!part) return null
  return parseSaViewToken(decodeURIComponent(part.slice(SA_VIEW_COOKIE.length + 1)))
}
