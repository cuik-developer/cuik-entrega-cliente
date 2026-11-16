import { generateClientToken, verifyClientToken } from "@/lib/client-token"

/**
 * Signed link that lets a client change their promotions authorization. Its
 * own key (the auth secret plus a purpose) keeps it apart from the pass access
 * link: one cannot be used as the other.
 */
const PREFERENCES_TOKEN_HOURS = 24

function key(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET
  return secret ? `${secret}:preferencias` : null
}

export function preferencesToken(clientId: string): string | null {
  const k = key()
  return k ? generateClientToken(k, clientId, PREFERENCES_TOKEN_HOURS) : null
}

/** The client id the token was issued for, or null when invalid or expired. */
export function verifyPreferencesToken(token: string): string | null {
  const k = key()
  if (!k) return null
  const result = verifyClientToken(k, token)
  return result.valid && result.clientId ? result.clientId : null
}
