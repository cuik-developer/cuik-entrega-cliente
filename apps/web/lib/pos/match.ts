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
  /** "pos" (default) or "sale_order": a till sale always goes before a sales order. */
  source?: string
}

/**
 * Order of preference when a stamp could be more than one sale (user rule,
 * 13 Nov 2026): the till's sale first, the sales order (Odoo Ventas) only
 * when no till sale fits; with neither, the merchant decides.
 */
export function sourceRank(source: string | null | undefined): 0 | 1 {
  return source === "sale_order" ? 1 : 0
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
 * Greedy: candidates (same DNI, same day) sorted by source (till before
 * sales order), then store agreement, then time distance; each visit and
 * each order used once. A sales order only gets a stamp no till sale of that
 * client took.
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
  type Cand = { order: MatchOrder; visit: MatchVisit; rank: 0 | 1; store: 0 | 1; dt: number }
  const cands: Cand[] = []
  for (const o of orders) {
    if (!o.dni) continue
    const list = visitsByKey.get(`${o.dni}|${dayInTz(o.soldAt, timezone)}`)
    if (!list) continue
    for (const v of list) {
      cands.push({
        order: o,
        visit: v,
        rank: sourceRank(o.source),
        store: sameStore(o.store, v.location) ? 0 : 1,
        dt: Math.abs(o.soldAt.getTime() - v.createdAt.getTime()),
      })
    }
  }
  cands.sort((a, b) => a.rank - b.rank || a.store - b.store || a.dt - b.dt)
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

/* ---------- Inferred links: guest sales paired with a visit by time ---------- */

export type GuestOrder = {
  id: string
  soldAt: Date
  store: string | null
  amount: number
  /** The document typed at the till, when it matched no Cuik client (a typo, a relative's DNI). */
  dni?: string | null
}

export type FreeVisit = {
  id: string
  clientId: string
  createdAt: Date
  location: string | null
  /** Purchase amount the cashier typed when stamping (cashback), if any. */
  amount: number | null
}

export type InferredKind = "inferred_amount" | "inferred_time"

export type InferredLink = { visitId: string; clientId: string; kind: InferredKind }

/** A registered client's sale without a stamp: not linkable here, but it can be the visit's real purchase. */
export type Blocker = { soldAt: Date; store: string | null; amount: number }

export type InferOptions = {
  windowMinutes: number
  timezone: string
  blockers?: Blocker[]
  /** Every POS store name of the tenant and every Cuik location name, to tell a 1:1 store map from an ambiguous one. */
  stores?: string[]
  locations?: string[]
}

/** Time-only pairing: the cashier may scan while still closing the order, so the visit may precede the sale by this much. */
export const INFER_BEFORE_MS = 3 * 60_000

/** Visit amount equal to the sale within S/ 0.50 or 2 %, whichever is larger. */
export function sameAmount(sale: number, visit: number | null): boolean {
  if (visit === null || !Number.isFinite(visit)) return false
  return Math.abs(sale - visit) <= Math.max(0.5, sale * 0.02)
}

/**
 * Which Cuik location each POS store stands for, when that is unambiguous:
 * a store that shares words with two locations ("CHACARILLA - SURCO" against
 * "Surco - Jacaranda" and "Chacarilla"), or a location two stores share, is
 * left out, since a wrong store would make a wrong link. A tenant with a
 * single location gets every store, and visits with no location, mapped to it.
 */
export function storeMap(
  stores: string[],
  locations: string[],
  opts: { tenantWide: boolean } = { tenantWide: true },
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const uniqueLocations = [...new Set(locations.filter(Boolean))]
  // Only the tenant's full list can say it has a single location; a batch cannot.
  const single =
    opts.tenantWide && uniqueLocations.length <= 1 ? (uniqueLocations[0] ?? null) : undefined
  const takenBy = new Map<string, string[]>()
  for (const s of new Set(stores.filter(Boolean))) {
    if (single !== undefined) {
      out.set(s, single)
      continue
    }
    const hits = uniqueLocations.filter((l) => sameStore(s, l))
    if (hits.length === 1) {
      out.set(s, hits[0])
      takenBy.set(hits[0], [...(takenBy.get(hits[0]) ?? []), s])
    }
  }
  for (const list of takenBy.values()) {
    if (list.length > 1) for (const s of list) out.delete(s)
  }
  return out
}

/**
 * Pairs sales that carry no DNI (guest, blank name, non-DNI document) with
 * the Cuik visit stamped at the same store right after the sale (the cashier
 * charges first, scans next). Two levels, both same local day and same store:
 *
 * - `inferred_amount`: the visit's amount equals the sale's, within the window
 *   on either side (a stamp given before charging, or a service charged on
 *   pick-up), and no other sale or visit in the window has that amount too.
 *   A sale typed under a document that matches no Cuik client (a typo, a
 *   relative's DNI) qualifies as well as a guest sale.
 * - `inferred_time`: guest sales only; the visit has no amount, the sale is
 *   the only one of that store from 3 minutes before to the window after
 *   the visit, and the visit the only free one in the sale's window.
 *
 * Ties and look-alikes are left unlinked rather than guessed. A registered
 * client's sale without a stamp (`blockers`) counts as a rival: it may be the
 * visit's real purchase. Each sale and each visit is used at most once.
 * Callers pass only sales of no Cuik client with a positive amount, and
 * visits no sale owns yet.
 */
export function inferGuestLinks(
  orders: GuestOrder[],
  visits: FreeVisit[],
  opts: InferOptions,
): Map<string, InferredLink> {
  const afterMs = Math.max(0, opts.windowMinutes) * 60_000
  const map =
    opts.stores && opts.locations
      ? storeMap(opts.stores, opts.locations)
      : // Nothing known beyond this batch: the batch's own names decide, strictly.
        storeMap(
          orders.map((o) => o.store ?? ""),
          visits.map((v) => v.location ?? ""),
          { tenantWide: false },
        )
  const singleLocation = !!opts.locations && new Set(opts.locations.filter(Boolean)).size <= 1
  const storeOk = (store: string | null, location: string | null): boolean => {
    if (!store) return false
    const mapped = map.get(store)
    if (mapped === undefined) return false
    if (location === null) return singleLocation
    return mapped === location
  }
  const inAmountWindow: InWindow = (o, v) => {
    const dt = v.createdAt.getTime() - o.soldAt.getTime()
    return Math.abs(dt) <= afterMs && storeOk(o.store, v.location)
  }
  const inTimeWindow: InWindow = (o, v) => {
    const dt = v.createdAt.getTime() - o.soldAt.getTime()
    return dt >= -INFER_BEFORE_MS && dt <= afterMs && storeOk(o.store, v.location)
  }
  // Same local day, by bucket: a range of months stays linear.
  const day = (d: Date) => dayInTz(d, opts.timezone)
  const visitsByDay = groupBy(visits, (v) => day(v.createdAt))
  const blockersByDay = groupBy(opts.blockers ?? [], (b) => day(b.soldAt))
  const ordersByDay = groupBy(orders, (o) => day(o.soldAt))

  const pairs = new Map<string, InferredLink>()
  for (const [k, dayOrders] of ordersByDay) {
    const dayVisits = visitsByDay.get(k) ?? []
    if (dayVisits.length === 0) continue
    const dayBlockers = blockersByDay.get(k) ?? []
    const byAmount = linkByAmount(dayOrders, dayVisits, dayBlockers, inAmountWindow)
    for (const [id, link] of byAmount) pairs.set(id, link)
    const usedVisits = new Set([...byAmount.values()].map((l) => l.visitId))
    const byTime = linkByTime(
      dayOrders.filter((o) => !pairs.has(o.id)),
      dayVisits.filter((v) => !usedVisits.has(v.id)),
      dayBlockers,
      inTimeWindow,
    )
    for (const [id, link] of byTime) pairs.set(id, link)
  }
  return pairs
}

type InWindow = (o: { soldAt: Date; store: string | null }, v: FreeVisit) => boolean

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

/** Level 1: the visit's amount equals the sale's, and nothing else in the window has that amount. */
function linkByAmount(
  orders: GuestOrder[],
  visits: FreeVisit[],
  blockers: Blocker[],
  inWindow: InWindow,
): Map<string, InferredLink> {
  const pairs = new Map<string, InferredLink>()
  const used = new Set<string>()
  for (const o of orders) {
    const byAmount = visits.filter(
      (v) =>
        !used.has(v.id) && v.amount !== null && inWindow(o, v) && sameAmount(o.amount, v.amount),
    )
    if (byAmount.length !== 1) continue
    const v = byAmount[0]
    const rivalSale = orders.some(
      (other) => other.id !== o.id && inWindow(other, v) && sameAmount(other.amount, v.amount),
    )
    const rivalDni = blockers.some((b) => inWindow(b, v) && sameAmount(b.amount, v.amount))
    if (rivalSale || rivalDni) continue
    pairs.set(o.id, { visitId: v.id, clientId: v.clientId, kind: "inferred_amount" })
    used.add(v.id)
  }
  return pairs
}

/** Level 2: guest sales only, no amount to compare; only a pair with no other sale or visit in reach. */
function linkByTime(
  orders: GuestOrder[],
  visits: FreeVisit[],
  blockers: Blocker[],
  inWindow: InWindow,
): Map<string, InferredLink> {
  const pairs = new Map<string, InferredLink>()
  for (const o of orders) {
    if (o.dni) continue
    const near = visits.filter((v) => inWindow(o, v))
    if (near.length !== 1) continue
    const v = near[0]
    // A typed amount that did not match above contradicts the pairing.
    if (v.amount !== null) continue
    const rivalSale = orders.some((other) => other.id !== o.id && inWindow(other, v))
    const rivalDni = blockers.some((b) => inWindow(b, v))
    if (rivalSale || rivalDni) continue
    pairs.set(o.id, { visitId: v.id, clientId: v.clientId, kind: "inferred_time" })
  }
  return pairs
}
