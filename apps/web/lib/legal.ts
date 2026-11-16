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
  /**
   * Personal data banks of CUIK E.I.R.L. registered before the ANPD (Ley 29733)
   * on 16 Nov 2026. The merchants' end clients are not here: each merchant is
   * their titular and Cuik is the encargado.
   */
  bancosDatos: [
    { nombre: "Clientes", codigo: "PJ-2026-6246" },
    { nombre: "Quejas y reclamos", codigo: "PJ-2026-6248" },
    { nombre: "Prospecto de clientes", codigo: "PJ-2026-6249" },
  ],
  site: "https://cuik.org",
  /** Microsoft Clarity project (public id). Loaded on the public site only, after consent. */
  clarityProjectId: "z0a19ctmz7",
  lastUpdated: "16 de noviembre de 2026",
} as const
