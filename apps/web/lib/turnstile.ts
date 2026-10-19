/**
 * Cloudflare Turnstile (anti-bot challenge) for the public forms.
 *
 * The site key is public (it ships to the browser). The secret lives in the
 * TURNSTILE_SECRET_KEY env var. While that variable is unset, verification is
 * SKIPPED (verifyTurnstile returns true and warns once) so production keeps
 * accepting forms until the variable is configured — see
 * docs/MANUAL_DEPLOYMENT.md. Once set, it fails closed: a missing token, a
 * rejected token, a network error or a 3 s timeout all return false.
 */

export const TURNSTILE_SITE_KEY = "0x4AAAAAAFcFn2q9D4QZVQ6n"

export const TURNSTILE_FAILED_MESSAGE =
  "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo."

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

let warned = false

export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (!warned) {
      warned = true
      console.warn("[turnstile] TURNSTILE_SECRET_KEY is not set: bot verification is skipped")
    }
    return true
  }
  if (!token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (ip && ip !== "unknown") body.set("remoteip", ip)

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const json = (await res.json()) as { success?: boolean }
    return json.success === true
  } catch (err) {
    console.error("[turnstile] siteverify failed", err)
    return false
  }
}
