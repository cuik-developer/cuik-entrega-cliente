/**
 * Simple in-memory rate limiter using sliding window.
 * Suitable for single-instance deployments (Dokploy).
 * Resets on server restart — acceptable tradeoff for simplicity.
 */

const store = new Map<string, number[]>()

// Cleanup old entries every 5 minutes to prevent memory leak
const CLEANUP_INTERVAL = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [key, timestamps] of store) {
    const valid = timestamps.filter((t) => now - t < 10 * 60 * 1000)
    if (valid.length === 0) store.delete(key)
    else store.set(key, valid)
  }
}, CLEANUP_INTERVAL)

/**
 * Check if a request should be rate limited.
 * @param key - Unique identifier (e.g., IP + email combo)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Window size in milliseconds (default 10 minutes)
 * @returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 10 * 60 * 1000,
): boolean {
  const now = Date.now()
  const timestamps = store.get(key) ?? []

  // Remove entries outside the window
  const valid = timestamps.filter((t) => now - t < windowMs)

  if (valid.length >= maxRequests) {
    return false // rate limited
  }

  valid.push(now)
  store.set(key, valid)
  return true // allowed
}
