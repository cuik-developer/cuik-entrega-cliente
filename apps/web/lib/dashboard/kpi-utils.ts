/**
 * Day-over-day comparison helpers for the Dashboard KPIs.
 * Pure functions — the SQL lives in compute-dashboard.ts.
 */

export type DayKpi = {
  /** Today, 00:00 → now (tenant time). */
  today: number
  /** The same weekday last week, 00:00 → the same time of day. */
  previous: number
}

/**
 * Percentage change from `previous` to `today`, rounded to an integer.
 * With no base to compare against (previous = 0) it returns 0: the operator
 * asked for a plain "0%" there rather than "sin base" or an infinite jump.
 */
export function pctDelta(today: number, previous: number): number {
  if (previous <= 0) return 0
  return Math.round(((today - previous) / previous) * 100)
}
