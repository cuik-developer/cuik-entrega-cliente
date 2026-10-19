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
export const LEGAL_PAGES_ENABLED = true

export const LEGAL = {
  brand: "Cuik",
  razonSocial: "MAKING BRANDS S.R.L.",
  ruc: "20602048196",
  /** Shown only where the law asks for it: the Libro de Reclamaciones and the Privacy Policy. */
  domicilio: "Calle Palma Real N.° 175, Int. 402, La Molina, Lima, Perú",
  email: "francesco.leon@cuik.org",
  /** Contact for ARCO rights (Ley 29733). */
  privacyEmail: "francesco.leon@cuik.org",
  /** Registration code of the personal data bank before the ANPD, once obtained. */
  bancoDatosCodigo: "en trámite",
  site: "https://cuik.org",
  /** Microsoft Clarity project (public id). Loaded on the public site only, after consent. */
  clarityProjectId: "z0a19ctmz7",
  lastUpdated: "21 de septiembre de 2026",
} as const
