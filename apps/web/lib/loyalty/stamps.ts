/**
 * Stamp arithmetic in ONE place.
 *
 * `total_visits` is a lifetime counter (tiers, segments and analytics depend
 * on it) and never goes down. Stamps spent on an early cash-out ("escalera
 * canjeable": S/ 5 at stamp 5 instead of waiting for the full card) are
 * counted in `clients.stamps_cashed`; what drives the card is the difference:
 *
 *   effective = totalVisits - stampsCashed
 *   stampsInCycle = effective % maxVisits
 *   cyclesCompleted = floor(effective / maxVisits)
 *
 * Every place that computes the card position must go through these helpers
 * so the till, the passes and the reports agree. `stampsCashed` is required on
 * purpose: a query that forgets to select it does not compile.
 */

export type StampCounters = {
  totalVisits: number
  /** Stamps spent on early cash-outs (0 for programs without one). */
  stampsCashed: number
}

/** Visits that still count towards the card (lifetime visits minus cashed stamps). */
export function effectiveVisits(c: StampCounters): number {
  return Math.max(0, c.totalVisits - (c.stampsCashed ?? 0))
}

/** Position in the current cycle, 0 .. maxVisits-1. */
export function stampsInCycleOf(c: StampCounters, maxVisits: number): number {
  if (maxVisits <= 0) return 0
  return effectiveVisits(c) % maxVisits
}

/** Reward cycles completed so far. */
export function cyclesCompletedOf(c: StampCounters, maxVisits: number): number {
  if (maxVisits <= 0) return 0
  return Math.floor(effectiveVisits(c) / maxVisits)
}
