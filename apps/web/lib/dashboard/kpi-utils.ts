/**
 * Week-to-date comparison helpers for the Dashboard KPIs.
 * Pure functions — the SQL lives in compute-dashboard.ts.
 */

export type WeekKpi = {
  /** This week, Monday 00:00 → now (tenant time). */
  current: number
  /** Last week, Monday 00:00 → the same weekday and time of day. */
  previous: number
  /** Today only. */
  today: number
}

/**
 * Percentage change from `previous` to `current`, rounded to an integer.
 * `null` when there is no base to compare against (previous = 0) — showing
 * "+∞%" or "+100%" there would be misleading.
 */
export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

/**
 * "lun–mar" style label for the week-to-date window, from an ISO date string
 * ("YYYY-MM-DD") of today in the tenant's timezone. Monday alone reads "lun".
 */
export function weekRangeLabel(todayLocal: string): string {
  const [y, m, d] = todayLocal.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  const today = WEEKDAYS[dow]
  return dow === 1 ? today : `lun–${today}`
}
