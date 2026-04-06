import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Generate an HMAC-SHA256 authentication token for an Apple Wallet pass.
 *
 * The token is used in the `authenticationToken` field of pass.json and
 * verified by the Web Service Protocol handlers when Apple devices call back.
 *
 * @param secret  - The APPLE_AUTH_SECRET value (passed by caller)
 * @param serialNumber - The pass serial number (e.g., "cuik:cafe:a1b2c3d4e5f6")
 * @returns Hex-encoded HMAC-SHA256 digest
 */
export function generateAuthToken(secret: string, serialNumber: string): string {
  return createHmac("sha256", secret).update(serialNumber).digest("hex")
}

/**
 * Verify an authentication token using timing-safe comparison.
 *
 * @param secret  - The APPLE_AUTH_SECRET value
 * @param serialNumber - The pass serial number
 * @param token   - The token to verify (from Authorization header)
 * @returns true if the token is valid
 */
export function verifyAuthToken(secret: string, serialNumber: string, token: string): boolean {
  const expected = generateAuthToken(secret, serialNumber)

  // Both must be hex strings of equal length for timingSafeEqual
  if (expected.length !== token.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"))
}
