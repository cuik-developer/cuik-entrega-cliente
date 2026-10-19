/**
 * Simple in-memory rate limiter using sliding window.
 * Suitable for single-instance deployments (Dokploy).
 * Resets on server restart — acceptable tradeoff for simplicity.
 */

type Entry = { timestamps: number[]; windowMs: number }

const store = new Map<string, Entry>()

const DEFAULT_WINDOW_MS = 10 * 60 * 1000

/**
 * Drop timestamps that fell out of their key's own window, and empty keys.
 * Each key remembers its window, so hourly or daily limits survive the sweep
 * (the old sweep used a fixed 10 minutes and silently reset longer windows).
 */
export function pruneRateLimitStore(now = Date.now()) {
  for (const [key, entry] of store) {
    const valid = entry.timestamps.filter((t) => now - t < entry.windowMs)
    if (valid.length === 0) store.delete(key)
    else entry.timestamps = valid
  }
}

// Cleanup old entries every 5 minutes to prevent memory leak
const CLEANUP_INTERVAL = 5 * 60 * 1000
const timer = setInterval(() => pruneRateLimitStore(), CLEANUP_INTERVAL)
// Do not keep a Node process (tests, scripts) alive just for the sweep.
;(timer as { unref?: () => void }).unref?.()

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
  windowMs = DEFAULT_WINDOW_MS,
): boolean {
  const now = Date.now()
  const entry = store.get(key)

  // Remove entries outside the window
  const valid = (entry?.timestamps ?? []).filter((t) => now - t < windowMs)

  if (valid.length >= maxRequests) {
    if (entry) entry.timestamps = valid
    return false // rate limited
  }

  valid.push(now)
  store.set(key, { timestamps: valid, windowMs: Math.max(windowMs, entry?.windowMs ?? 0) })
  return true // allowed
}

/** Spanish message for every 429 of the public forms. */
export const RATE_LIMIT_MESSAGE = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
