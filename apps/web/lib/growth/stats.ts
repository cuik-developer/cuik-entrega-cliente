import { brandOf, categoryKey, classifyLine, type Species, speciesOfKey } from "./categories"
import { addDays, daysBetween, median, previousWeekday, weekdayOf } from "./dates"
import type { GrowthRules } from "./rules"

/**
 * Per-client rhythm and preferences (growth.client_stats), computed from the
 * POS sales the connector linked to the client. Pure: the caller loads the
 * rows and the fallback intervals; this decides.
 */

export type PurchaseLine = {
  sku: string | null
  productName: string | null
  odooCategory: string | null
  masterCategory?: string | null
  masterClass?: string | null
  masterSubclass?: string | null
  total: number
}

export type Purchase = {
  /** Tenant-local day of the sale. */
  soldOn: string
  store: string | null
  amount: number
  lines: PurchaseLine[]
}

export type CategoryStat = { orders: number; spend: number; lastOn: string }

export type ClientStats = {
  purchases: number
  purchases12m: number
  spend12m: number
  firstPurchaseOn: string | null
  lastPurchaseOn: string | null
  lastStore: string | null
  intervalDays: number | null
  intervalSource: "own" | "category" | "tenant" | null
  habitualWeekday: number | null
  expectedOn: string | null
  suggestedOn: string | null
  species: Species | null
  mainCategory: string | null
  mainProductSku: string | null
  mainProductName: string | null
  mainBrand: string | null
  stores12m: number
  categories: Record<string, CategoryStat>
}

export type StatsContext = {
  /** Tenant-local "today". */
  today: string
  rules: Pick<GrowthRules, "minPurchases" | "maxEarlyDays">
  /** Typical interval per category key (median of clients with their own interval). */
  categoryIntervals?: ReadonlyMap<string, number>
  /** Median interval of the tenant's clients, when the category has none. */
  tenantInterval?: number | null
}

const EMPTY: ClientStats = {
  purchases: 0,
  purchases12m: 0,
  spend12m: 0,
  firstPurchaseOn: null,
  lastPurchaseOn: null,
  lastStore: null,
  intervalDays: null,
  intervalSource: null,
  habitualWeekday: null,
  expectedOn: null,
  suggestedOn: null,
  species: null,
  mainCategory: null,
  mainProductSku: null,
  mainProductName: null,
  mainBrand: null,
  stores12m: 0,
  categories: {},
}

/** Up to this many of the latest intervals feed the median (recent rhythm wins). */
const INTERVALS_WINDOW = 6
/** A weekday is "habitual" when it holds more than half of the recent purchase days. */
const HABITUAL_SHARE = 0.5
const HABITUAL_MIN_DAYS = 3

/**
 * Own interval: median of the last intervals between distinct purchase days.
 * Null with fewer than `minPurchases` days.
 */
export function ownInterval(days: string[], minPurchases: number): number | null {
  if (days.length < minPurchases || days.length < 2) return null
  const recent = days.slice(-(INTERVALS_WINDOW + 1))
  const gaps: number[] = []
  for (let i = 1; i < recent.length; i++) gaps.push(daysBetween(recent[i - 1], recent[i]))
  const m = median(gaps)
  return m === null ? null : Math.max(1, Math.round(m * 10) / 10)
}

/** Weekday that concentrates the purchase days, if any. */
export function habitualWeekday(days: string[]): number | null {
  if (days.length < HABITUAL_MIN_DAYS) return null
  const counts = new Array<number>(7).fill(0)
  for (const d of days) counts[weekdayOf(d)]++
  let best = 0
  for (let i = 1; i < 7; i++) if (counts[i] > counts[best]) best = i
  return counts[best] / days.length > HABITUAL_SHARE ? best : null
}

/**
 * The day to write: the client's habitual weekday just before the expected
 * day (never more than `maxEarlyDays` before it); without a habitual weekday,
 * two days before. Never before the day after the last purchase.
 */
export function suggestedDay(
  expectedOn: string,
  lastPurchaseOn: string,
  weekday: number | null,
  maxEarlyDays: number,
): string {
  let suggested = addDays(expectedOn, -Math.min(2, maxEarlyDays))
  if (weekday !== null) {
    const prev = previousWeekday(expectedOn, weekday)
    if (daysBetween(prev, expectedOn) <= maxEarlyDays) suggested = prev
  }
  const floor = addDays(lastPurchaseOn, 1)
  return suggested < floor ? floor : suggested
}

type Aggregate = {
  spend12m: number
  stores: Set<string>
  categories: Record<string, CategoryStat>
  speciesSpend: Map<Species, number>
  products: Map<string, { name: string | null; orders: number; spend: number }>
  brands: Map<string, number>
}

function bump<K>(map: Map<K, number>, key: K, by: number) {
  map.set(key, (map.get(key) ?? 0) + by)
}

/** Totals of the last 12 months per category, product and brand. */
function aggregate(recent: Purchase[]): Aggregate {
  const agg: Aggregate = {
    spend12m: 0,
    stores: new Set(),
    categories: {},
    speciesSpend: new Map(),
    products: new Map(),
    brands: new Map(),
  }
  for (const p of recent) {
    agg.spend12m += p.amount
    if (p.store) agg.stores.add(p.store)
    const seen = { keys: new Set<string>(), skus: new Set<string>() }
    for (const line of p.lines) addLine(agg, p.soldOn, line, seen)
  }
  for (const k of Object.keys(agg.categories))
    agg.categories[k].spend = round2(agg.categories[k].spend)
  return agg
}

/** One line into the totals; `seen` keeps "orders" counting each order once per key / SKU. */
function addLine(
  agg: Aggregate,
  soldOn: string,
  line: PurchaseLine,
  seen: { keys: Set<string>; skus: Set<string> },
) {
  const cls = classifyLine(line)
  const key = categoryKey(cls)
  if (key) {
    const stat = agg.categories[key] ?? { orders: 0, spend: 0, lastOn: soldOn }
    stat.spend += line.total
    if (!seen.keys.has(key)) {
      stat.orders++
      seen.keys.add(key)
    }
    if (soldOn > stat.lastOn) stat.lastOn = soldOn
    agg.categories[key] = stat
    if (cls.species) bump(agg.speciesSpend, cls.species, line.total)
  }
  const sku = line.sku ?? line.productName
  if (sku) {
    const prod = agg.products.get(sku) ?? { name: line.productName, orders: 0, spend: 0 }
    prod.spend += line.total
    if (!seen.skus.has(sku)) {
      prod.orders++
      seen.skus.add(sku)
    }
    agg.products.set(sku, prod)
  }
  const brand = brandOf(line.productName)
  if (brand) bump(agg.brands, brand, line.total)
}

/** The client's interval: own, else the category's, else the tenant's. */
function resolveInterval(
  days: string[],
  mainCategory: string | null,
  ctx: StatsContext,
): { intervalDays: number | null; intervalSource: ClientStats["intervalSource"] } {
  const own = ownInterval(days, ctx.rules.minPurchases)
  if (own) return { intervalDays: own, intervalSource: "own" }
  const byCategory = mainCategory ? ctx.categoryIntervals?.get(mainCategory) : undefined
  if (byCategory) return { intervalDays: byCategory, intervalSource: "category" }
  if (ctx.tenantInterval) return { intervalDays: ctx.tenantInterval, intervalSource: "tenant" }
  return { intervalDays: null, intervalSource: null }
}

export function computeClientStats(purchases: Purchase[], ctx: StatsContext): ClientStats {
  if (purchases.length === 0) return { ...EMPTY }
  const sorted = [...purchases].sort((a, b) => (a.soldOn < b.soldOn ? -1 : 1))
  const days = [...new Set(sorted.map((p) => p.soldOn))]
  const since12m = addDays(ctx.today, -365)
  const recent = sorted.filter((p) => p.soldOn >= since12m)
  const recentDays = [...new Set(recent.map((p) => p.soldOn))]
  const agg = aggregate(recent)

  const mainCategory = topBy(Object.entries(agg.categories), ([, s]) => s.spend)?.[0] ?? null
  const species =
    (mainCategory ? speciesOfKey(mainCategory) : null) ??
    topBy([...agg.speciesSpend.entries()], ([, v]) => v)?.[0] ??
    null
  const mainProduct = topBy([...agg.products.entries()], ([, p]) => p.orders * 1_000_000 + p.spend)
  const mainBrand = topBy([...agg.brands.entries()], ([, v]) => v)?.[0] ?? null

  const lastPurchaseOn = days[days.length - 1]
  const { intervalDays, intervalSource } = resolveInterval(days, mainCategory, ctx)
  const weekday = habitualWeekday(recentDays.length >= HABITUAL_MIN_DAYS ? recentDays : days)
  const expectedOn = intervalDays ? addDays(lastPurchaseOn, Math.round(intervalDays)) : null
  const suggestedOn = expectedOn
    ? suggestedDay(expectedOn, lastPurchaseOn, weekday, ctx.rules.maxEarlyDays)
    : null

  return {
    purchases: days.length,
    purchases12m: recentDays.length,
    spend12m: round2(agg.spend12m),
    firstPurchaseOn: days[0],
    lastPurchaseOn,
    lastStore: sorted[sorted.length - 1].store,
    intervalDays,
    intervalSource,
    habitualWeekday: weekday,
    expectedOn,
    suggestedOn,
    species,
    mainCategory,
    mainProductSku: mainProduct?.[0] ?? null,
    mainProductName: mainProduct?.[1].name ?? null,
    mainBrand,
    stores12m: agg.stores.size,
    categories: agg.categories,
  }
}

/**
 * Typical interval per category key: median of the own intervals of the
 * clients whose main category it is. Needs at least three clients.
 */
export function categoryIntervals(
  rows: {
    mainCategory: string | null
    intervalDays: number | null
    intervalSource: string | null
  }[],
): Map<string, number> {
  const byKey = new Map<string, number[]>()
  for (const r of rows) {
    if (!r.mainCategory || !r.intervalDays || r.intervalSource !== "own") continue
    const list = byKey.get(r.mainCategory) ?? []
    list.push(r.intervalDays)
    byKey.set(r.mainCategory, list)
  }
  const out = new Map<string, number>()
  for (const [key, list] of byKey) {
    if (list.length < 3) continue
    const m = median(list)
    if (m) out.set(key, Math.round(m * 10) / 10)
  }
  return out
}

function topBy<T>(items: T[], score: (t: T) => number): T | undefined {
  let best: T | undefined
  let bestScore = Number.NEGATIVE_INFINITY
  for (const it of items) {
    const s = score(it)
    if (s > bestScore) {
      best = it
      bestScore = s
    }
  }
  return best
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
