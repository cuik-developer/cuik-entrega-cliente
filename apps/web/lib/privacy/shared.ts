/**
 * Client-safe pieces of the program privacy notice (no DB): the version a
 * client accepts and the public paths. Server code imports ./notice.
 */

/**
 * Version of the privacy notice a client accepts when registering. Stored with
 * every consent event, so a change of wording is provable afterwards: bump it
 * whenever the notice or the registration checkboxes change what they say.
 */
export const PRIVACY_NOTICE_VERSION = "2026-11-16"

/** Shown as "Última actualización" on the merchants' notices. */
export const PRIVACY_NOTICE_UPDATED = "16 de noviembre de 2026"

/** Public paths of a program's notice and preferences page. */
export const privacyNoticePath = (slug: string) => `/${slug}/privacidad`
export const preferencesPath = (slug: string) => `/${slug}/preferencias`

/** The notice can name the merchant's company only with all three legal fields. */
export function isPrivacyIdentityComplete(data: {
  razonSocial: string | null
  ruc: string | null
  direccion: string | null
}): boolean {
  return Boolean(data.razonSocial?.trim() && data.ruc?.trim() && data.direccion?.trim())
}
