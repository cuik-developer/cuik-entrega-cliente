/**
 * Stamp arithmetic in ONE place.
 *
 * `total_visits` is a lifetime counter (tiers, segments and analytics depend
 * on it) and never goes down. Expired stamps are counted separately in
 * `clients.stamps_expired`; what drives the card is the difference:
 *
 *   effective = totalVisits - stampsExpired
 *   stampsInCycle = effective % maxVisits
 *   cyclesCompleted = floor(effective / maxVisits)
 *
 * Every place that used to compute `totalVisits % maxVisits` must go through
 * these helpers so the card, the till and the pass agree.
 */

export type StampCounters = {
  totalVisits: number
  /** Stamps removed by expiration. Missing/null (legacy rows) means 0. */
  stampsExpired?: number | null
}

/** Visits that still count towards a reward (lifetime visits minus expired stamps). */
export function effectiveVisits(c: StampCounters): number {
  return Math.max(0, c.totalVisits - (c.stampsExpired ?? 0))
}

/** Position in the current cycle, 0 .. maxVisits-1. */
export function stampsInCycle(c: StampCounters, maxVisits: number): number {
  if (maxVisits <= 0) return 0
  return effectiveVisits(c) % maxVisits
}

/** Reward cycles completed so far. */
export function cyclesCompleted(c: StampCounters, maxVisits: number): number {
  if (maxVisits <= 0) return 0
  return Math.floor(effectiveVisits(c) / maxVisits)
}
