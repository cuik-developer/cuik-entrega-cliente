import type { CampaignKind, CampaignVerdict } from "./metrics"

/** Texts shared by the Impacto Loyalty screen and its Excel. No server imports. */

export const KIND_LABEL: Record<CampaignKind, string> = {
  manual: "Envío manual",
  recurring: "Recurrente",
  birthday: "Cumpleaños",
  points_expiring: "Puntos por vencer",
  churn: "Recuperación",
}

export const VERDICT_LABEL: Record<CampaignVerdict, string> = {
  above: "Superó lo normal",
  within: "Dentro de lo normal",
  below: "Por debajo de lo normal",
  running: "En curso",
  empty: "Sin clientes que medir",
  overlap: "No medible: otros mensajes en el plazo",
  no_reference: "No medible: no quedó con quién comparar",
}

export const ORIGIN_LABEL = {
  reference: "Referencia de otro comercio",
  measured: "Medido con sus ventas",
  declared: "Declarado por sus clientes",
} as const

export const ORIGIN_NOTE = {
  reference:
    "Referencia: este comercio no tiene medición propia. El 20 % es lo que se midió en Mascota Veloz con sus ventas; para cualquier otro negocio es un supuesto.",
  measured:
    "Medido: sale de comparar, con las ventas del propio comercio, a sus clientes con tarjeta contra los que no la tienen.",
  declared:
    "Declarado: sale de comparar cada cuánto dijeron los clientes que venían, al registrarse, con cada cuánto vienen ahora.",
} as const
