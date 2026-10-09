/** Alert shapes shared by the digest (server) and the manager strip (client). No server imports here. */

export type AlertKind = "billing" | "cold" | "demo" | "cert" | "campaign"
export type AlertSeverity = "critical" | "warning" | "info"

export type AdminAlert = {
  /** Stable id used for the send cadence, e.g. `cert:<tenantId>:30`. */
  key: string
  kind: AlertKind
  severity: AlertSeverity
  /** Tenant name, or "Cuik" for platform-wide alerts. */
  who: string
  text: string
  href: string
  /** Days until the event (negative = already passed), when it applies. */
  days?: number
}

export const ALERT_SECTION_TITLE: Record<AlertKind, string> = {
  billing: "Facturación",
  cold: "Comercios que se enfrían",
  demo: "Demos por vencer",
  cert: "Certificados Apple",
  campaign: "Campañas fallidas",
}
