import { normalizeDni } from "@/lib/loyalty/impact/columns"

/**
 * Pairs each synced POS order with the Cuik visit it belongs to: same client
 * (DNI), same local day, the same store when the names can be told apart,
 * and the closest time. Pure, so it is testable without a database.
 */

export type MatchOrder = {
  id: string
  dni: string | null
  /** Instant of sale. */
  soldAt: Date
  store: string | null
}

export type MatchVisit = {
  id: string
  dni: string
  createdAt: Date
  /** Cuik location name ("Jacaranda"); null when the visit has none. */
  location: string | null
}

/** "YYYY-MM-DD" of an instant in a timezone. */
export function dayInTz(d: Date, timezone: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: timezone })
}

const STORE_STOPWORDS = new Set([
  "tienda",
  "local",
  "sucursal",
  "shop",
  "store",
  "sede",
  "punto",
  "venta",
  "san",
  "santa",
  "los",
  "las",
])

/** Words of a store name worth comparing ("SURCO - JACARANDA" -> surco, jacaranda). */
export function storeTokens(name: string | null): Set<string> {
  const out = new Set<string>()
  if (!name) return out
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
  for (const w of words) {
    if (w.length >= 3 && !STORE_STOPWORDS.has(w)) out.add(w)
  }
  return out
}

/** True when the POS store and the Cuik location share a meaningful word. */
export function sameStore(posStore: string | null, location: string | null): boolean {
  const a = storeTokens(posStore)
  const b = storeTokens(location)
  for (const t of a) if (b.has(t)) return true
  return false
}

export type MatchResult = {
  /** order id -> visit id */
  pairs: Map<string, string>
  /** Orders of a Cuik client with no visit that day (purchase without a stamp). */
  unmatchedOrders: string[]
}

/**
 * Greedy: candidates (same DNI, same day) sorted by store agreement first,
 * then by time distance; each visit and each order used once.
 */
export function matchOrdersToVisits(
  orders: MatchOrder[],
  visits: MatchVisit[],
  timezone: string,
): MatchResult {
  const visitsByKey = new Map<string, MatchVisit[]>()
  for (const v of visits) {
    const dni = normalizeDni(v.dni)
    if (!dni) continue
    const key = `${dni}|${dayInTz(v.createdAt, timezone)}`
    const list = visitsByKey.get(key) ?? []
    list.push(v)
    visitsByKey.set(key, list)
  }
  type Cand = { order: MatchOrder; visit: MatchVisit; store: 0 | 1; dt: number }
  const cands: Cand[] = []
  for (const o of orders) {
    if (!o.dni) continue
    const list = visitsByKey.get(`${o.dni}|${dayInTz(o.soldAt, timezone)}`)
    if (!list) continue
    for (const v of list) {
      cands.push({
        order: o,
        visit: v,
        store: sameStore(o.store, v.location) ? 0 : 1,
        dt: Math.abs(o.soldAt.getTime() - v.createdAt.getTime()),
      })
    }
  }
  cands.sort((a, b) => a.store - b.store || a.dt - b.dt)
  const pairs = new Map<string, string>()
  const usedVisits = new Set<string>()
  for (const c of cands) {
    if (pairs.has(c.order.id) || usedVisits.has(c.visit.id)) continue
    pairs.set(c.order.id, c.visit.id)
    usedVisits.add(c.visit.id)
  }
  const unmatchedOrders = orders.filter((o) => o.dni && !pairs.has(o.id)).map((o) => o.id)
  return { pairs, unmatchedOrders }
}
