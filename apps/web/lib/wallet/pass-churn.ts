/**
 * Pure helpers for removed Wallet passes ("tarjetas eliminadas") and the pass
 * churn rate ("tasa de fuga"). No DB imports: safe for client components.
 */

/** Apple removals are recorded from this day on (migration 0031). Google has its own callback. */
export const APPLE_REMOVAL_TRACKING_SINCE = "2026-10-19"

/** Same day, for UI copy. */
export const APPLE_REMOVAL_TRACKING_SINCE_LABEL = "19 de octubre de 2026"

/** UI copy for the churn metric, in one place so it can be renamed. */
export const CHURN_LABEL = "Tasa de eliminación de tarjetas"
export const CHURN_LABEL_SHORT = "Tasa de eliminación"
export const CHURN_HELP =
  "Porcentaje de clientes que tenían la tarjeta y la eliminaron de su Wallet."

/**
 * removed / (installed + removed) as a percentage with one decimal, or null
 * when there is nothing to measure (denominator 0).
 */
export function churnRate(removed: number, installed: number): number | null {
  const r = Math.max(0, removed)
  const den = Math.max(0, installed) + r
  if (den === 0) return null
  return Math.round((r / den) * 1000) / 10
}

/** "12.5%" or "—" (es-PE decimal separator is the dot). */
export function formatChurnRate(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`
}

export type PassChurn = {
  installed: number
  removed: number
  removed30d: number
  /** removed / (installed + removed), % one decimal; null when both are 0. */
  rate: number | null
  /** removed in the last 30 days / (installed now + removed in the last 30 days). */
  rate30d: number | null
}

export function buildPassChurn(installed: number, removed: number, removed30d: number): PassChurn {
  return {
    installed,
    removed,
    removed30d,
    rate: churnRate(removed, installed),
    rate30d: churnRate(removed30d, installed),
  }
}
