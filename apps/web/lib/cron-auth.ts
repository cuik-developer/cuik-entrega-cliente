import { createHash, timingSafeEqual } from "node:crypto"

/**
 * True when the request carries the cron secret. Fails closed when
 * CRON_SECRET is unset or empty, and compares digests in constant time so the
 * response time says nothing about how much of the secret matched.
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  const given = request.headers.get("x-cron-secret")
  if (!expected || !given) return false
  const a = createHash("sha256").update(given).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}
