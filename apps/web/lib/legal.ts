/**
 * Legal identity used by Términos, Privacidad, Cookies and the Libro de
 * Reclamaciones. Fill in the bracketed values before going live; every page
 * reads from here so there is a single place to keep them current.
 */
/**
 * The legal pages, the Libro de Reclamaciones and the cookie banner stay
 * unpublished until the identity above is final. While false: no footer links,
 * no banner, and the routes answer 404.
 */
export const LEGAL_PAGES_ENABLED = false

export const LEGAL = {
  brand: "Cuik",
  razonSocial: "[Razón social de Cuik S.A.C.]",
  ruc: "[RUC]",
  domicilio: "[Dirección fiscal], Lima, Perú",
  email: "francesco.leon@cuik.org",
  /** Contact for ARCO rights (Ley 29733). */
  privacyEmail: "francesco.leon@cuik.org",
  /** Registration code of the personal data bank before the ANPD, once obtained. */
  bancoDatosCodigo: "[código de inscripción del banco de datos]",
  site: "https://cuik.org",
  lastUpdated: "21 de septiembre de 2026",
} as const
