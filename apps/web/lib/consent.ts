/**
 * Cookie consent, kept in one first-party cookie and mirrored in
 * localStorage. Only "accepted" allows loading non-essential scripts
 * (analytics, pixels). The site sets none today; when one is added, gate it
 * with `hasAnalyticsConsent()` and listen to `cuik:consent` to load it late.
 */
export type Consent = "accepted" | "rejected"

export const CONSENT_COOKIE = "cuik_consent"
const ONE_YEAR = 60 * 60 * 24 * 365

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=(accepted|rejected)`))
  if (m) return m[1] as Consent
  try {
    const v = localStorage.getItem(CONSENT_COOKIE)
    return v === "accepted" || v === "rejected" ? v : null
  } catch {
    return null
  }
}

export function writeConsent(value: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`
  try {
    localStorage.setItem(CONSENT_COOKIE, value)
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("cuik:consent", { detail: value }))
}

export function hasAnalyticsConsent(): boolean {
  return readConsent() === "accepted"
}
