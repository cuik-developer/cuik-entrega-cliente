import { importPKCS8, SignJWT } from "jose"
import type { GoogleWalletConfig } from "../shared/types"

// ─── Module-Level Token Cache ─────────────────────────────────────────

let cachedToken: string | null = null
let cachedTokenExpiry = 0

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer"

// Buffer: refresh 60 seconds before actual expiry
const EXPIRY_BUFFER_SECONDS = 300

/**
 * Get a Google OAuth2 access token using service account JWT assertion (RS256).
 * Caches the token in memory and refreshes when expired.
 *
 * Uses `jose` for JWT signing and native `fetch` for the token exchange.
 * No dependency on `google-auth-library`.
 */
export async function getGoogleAccessToken(config: GoogleWalletConfig): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000)

  // Return cached token if still valid
  if (cachedToken && nowSeconds < cachedTokenExpiry) {
    return cachedToken
  }

  const { client_email, private_key } = config.serviceAccountJson

  // Import the PEM private key for RS256 signing
  const rsaKey = await importPKCS8(private_key, "RS256")

  // Build JWT assertion
  const assertion = await new SignJWT({
    scope: GOOGLE_WALLET_SCOPE,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 3600)
    .sign(rsaKey)

  // Exchange JWT for access token
  const body = new URLSearchParams()
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
  body.set("assertion", assertion)

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
  }

  if (!response.ok) {
    throw new Error(
      `[Wallet:Google] OAuth2 token error: ${response.status} ${JSON.stringify(json)}`,
    )
  }

  if (!json.access_token) {
    throw new Error("[Wallet:Google] OAuth2 response missing access_token")
  }

  // Cache with buffer before expiry (default token lifetime is 3600s)
  const expiresIn = json.expires_in ?? 3600
  cachedToken = json.access_token
  cachedTokenExpiry = nowSeconds + expiresIn - EXPIRY_BUFFER_SECONDS

  return cachedToken
}

/**
 * Clear the cached token. Useful for testing or forced refresh.
 */
export function clearGoogleTokenCache(): void {
  cachedToken = null
  cachedTokenExpiry = 0
}
