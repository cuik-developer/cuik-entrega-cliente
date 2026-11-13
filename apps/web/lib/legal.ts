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
  // CUIK E.I.R.L. issues and provides the service from November 2026 (Making
  // Brands before). Keep in sync with Finanzas › Empresa y régimen (finance.issuers).
  razonSocial: "CUIK E.I.R.L.",
  ruc: "20606652055",
  /** Shown only where the law asks for it: the Libro de Reclamaciones and the Privacy Policy. */
  domicilio: "Av. Velasco Astete N.° 1879, Santiago de Surco, Lima, Perú",
  email: "francesco.leon@cuik.org",
  /** Contact for ARCO rights (Ley 29733). */
  privacyEmail: "francesco.leon@cuik.org",
  /** Registration code of the personal data bank before the ANPD, once obtained. */
  bancoDatosCodigo: "en trámite",
  site: "https://cuik.org",
  /** Microsoft Clarity project (public id). Loaded on the public site only, after consent. */
  clarityProjectId: "z0a19ctmz7",
  lastUpdated: "13 de noviembre de 2026",
} as const
