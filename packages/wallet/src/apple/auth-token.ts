import { createHmac, timingSafeEqual } from "node:crypto"

const HEX_TOKEN = /^[0-9a-f]+$/i

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

  // Both must be hex strings of equal length for timingSafeEqual. A non-hex
  // token of the right length would decode to a shorter buffer and make
  // timingSafeEqual throw, so reject anything that is not exactly hex.
  if (typeof token !== "string" || token.length !== expected.length || !HEX_TOKEN.test(token)) {
    return false
  }

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"))
}
