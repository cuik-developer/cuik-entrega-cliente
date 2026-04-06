import { importPKCS8, SignJWT } from "jose"
import type { SaveLinkParams } from "../shared/types"

const GOOGLE_SAVE_BASE_URL = "https://pay.google.com/gp/v/save"

/**
 * Generate a Google "Save to Wallet" URL for a loyalty object.
 *
 * Builds a signed JWT (RS256) with the loyalty object reference,
 * then returns a URL that users can click to add the pass to Google Wallet.
 *
 * The `origins` field must list the exact domains where this link will
 * be rendered — Google Wallet validates the referrer.
 */
export async function buildSaveToWalletUrl(params: SaveLinkParams): Promise<string> {
  const { objectId, serviceAccountEmail, privateKey, origins } = params

  const rsaKey = await importPKCS8(privateKey, "RS256")
  const nowSeconds = Math.floor(Date.now() / 1000)

  const token = await new SignJWT({
    iss: serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins,
    payload: {
      loyaltyObjects: [{ id: objectId }],
    },
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 86400) // 24 hours
    .sign(rsaKey)

  return `${GOOGLE_SAVE_BASE_URL}/${token}`
}
