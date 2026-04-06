import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Generate a stateless HMAC token for client pass access.
 * Token format: clientId:expiryTimestamp:hmacHex
 *
 * @param secret - BETTER_AUTH_SECRET from env
 * @param clientId - The client UUID
 * @param expiryHours - Token validity in hours (default 24)
 */
export function generateClientToken(secret: string, clientId: string, expiryHours = 24): string {
  const expiry = Math.floor(Date.now() / 1000) + expiryHours * 3600
  const payload = `${clientId}:${expiry}`
  const hmac = createHmac("sha256", secret).update(payload).digest("hex")
  return `${clientId}:${expiry}:${hmac}`
}

/**
 * Verify a client token and extract the clientId if valid.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyClientToken(
  secret: string,
  token: string,
): { valid: boolean; clientId?: string } {
  const parts = token.split(":")
  if (parts.length !== 3) return { valid: false }

  const [clientId, expiryStr, providedHmac] = parts
  const expiry = parseInt(expiryStr, 10)

  if (Number.isNaN(expiry)) return { valid: false }

  // Check expiry
  if (Math.floor(Date.now() / 1000) > expiry) return { valid: false }

  // Verify HMAC
  const payload = `${clientId}:${expiryStr}`
  const expectedHmac = createHmac("sha256", secret).update(payload).digest("hex")

  if (expectedHmac.length !== providedHmac.length) return { valid: false }

  const isValid = timingSafeEqual(
    Buffer.from(expectedHmac, "hex"),
    Buffer.from(providedHmac, "hex"),
  )

  return isValid ? { valid: true, clientId } : { valid: false }
}
