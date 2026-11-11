import type {
  CuikClient,
  CuikVisit,
  ImpactInput,
  ImpactSummary,
  PurchaseRetention,
  SaleOrder,
} from "./types"

/**
 * The Impacto metrics, pure: sales of the merchant, Cuik clients and visits
 * in, one ImpactSummary out. Same rules as the Mascota Veloz analysis of
 * November 2026 (scripts cross / stores / compliance80 / retention), now for
 * any tenant.
 */

// --- Date helpers (all days are "YYYY-MM-DD") ---

const DAY_MS = 86_400_000

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function gapsOf(days: string[]): number[] {
  return days.slice(1).map((d, i) => dayDiff(days[i], d))
}

export function pct(part: number, total: number): number | null {
  return total > 0 ? Math.round((1000 * part) / total) / 10 : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// --- Per-DNI purchase history ---

type Buyer = {
  dni: string
  name: string | null
  phone: string | null
  /** Unique purchase days, sorted. */
  days: string[]
  total: number
  stores: Set<string>
  /** dni|day -> total of the day and the stores of that day. */
  byDay: Map<string, { total: number; stores: Set<string> }>
}

function groupBuyers(orders: SaleOrder[]): Map<string, Buyer> {
  const buyers = new Map<string, Buyer>()
  for (const o of orders) {
    if (!o.dni) continue
    let b = buyers.get(o.dni)
    if (!b) {
      b = {
        dni: o.dni,
        name: o.name,
        phone: o.phone,
        days: [],
        total: 0,
        stores: new Set(),
        byDay: new Map(),
      }
      buyers.set(o.dni, b)
    }
    b.name ??= o.name
    b.phone ??= o.phone
    b.total += o.amount
    if (o.store) b.stores.add(o.store)
    let d = b.byDay.get(o.day)
    if (!d) {
      d = { total: 0, stores: new Set() }
      b.byDay.set(o.day, d)
    }
    d.total += o.amount
    if (o.store) d.stores.add(o.store)
  }
  for (const b of buyers.values()) b.days = [...b.byDay.keys()].sort()
  return buyers
}

/** Near-daily buyers across the file: a staff DNI used at the till, not a client. */
export function detectStaff(
  buyers: Iterable<Buyer>,
): { dni: string; name: string | null; purchases: number }[] {
  const out: { dni: string; name: string | null; purchases: number }[] = []
  for (const b of buyers) {
    if (b.days.length >= 100 && (median(gapsOf(b.days)) ?? 99) <= 2) {
      out.push({ dni: b.dni, name: b.name, purchases: b.days.length })
    }
  }
  return out.sort((a, b) => b.purchases - a.purchases)
}

function storeList(stores: Set<string>): string {
  return [...stores].sort().join(" · ")
}

// --- The summary ---

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over the sales per metric block; splitting it would repeat the groupings
export function computeImpact(input: ImpactInput): ImpactSummary {
  const { options } = input
  const manualExcluded = new Set(options.excludedDnis.map((d) => d.replace(/\D/g, "")))
  // A refund (negative order) is not a purchase: it nets the revenue and nothing else.
  const purchases = input.orders.filter((o) => o.amount > 0)
  const refunds = input.orders.filter((o) => o.amount < 0)
  const allBuyers = groupBuyers(purchases)
  const detectedStaff = detectStaff(allBuyers.values()).filter((s) => !manualExcluded.has(s.dni))
  const excluded = new Set([...manualExcluded, ...detectedStaff.map((s) => s.dni)])

  const orders = purchases.filter((o) => !o.dni || !excluded.has(o.dni))
  const buyers = new Map([...allBuyers].filter(([dni]) => !excluded.has(dni)))
  const days = orders.map((o) => o.day).sort()
  const from = days[0] ?? ""
  const to = days[days.length - 1] ?? ""
  const END = to

  // Coverage of the file.
  const storeCov = new Map<string, { orders: number; withDni: number; revenue: number }>()
  const monthCov = new Map<string, { orders: number; revenue: number }>()
  let revenue = 0
  let withDni = 0
  for (const o of orders) {
    revenue += o.amount
    if (o.dni) withDni++
    const s = storeCov.get(o.store ?? "(sin tienda)") ?? { orders: 0, withDni: 0, revenue: 0 }
    s.orders++
    s.revenue += o.amount
    if (o.dni) s.withDni++
    storeCov.set(o.store ?? "(sin tienda)", s)
    const m = o.day.slice(0, 7)
    const mc = monthCov.get(m) ?? { orders: 0, revenue: 0 }
    mc.orders++
    mc.revenue += o.amount
    monthCov.set(m, mc)
  }
  for (const r of refunds) {
    if (r.dni && excluded.has(r.dni)) continue
    revenue += r.amount
    const s = storeCov.get(r.store ?? "(sin tienda)")
    if (s) s.revenue += r.amount
    const mc = monthCov.get(r.day.slice(0, 7))
    if (mc) mc.revenue += r.amount
  }
  const avgTicket = orders.length ? round2(revenue / orders.length) : null

  // Cuik clients and visits, without the excluded DNIs.
  const clients = new Map<string, CuikClient>()
  for (const c of input.clients)
    if (!excluded.has(c.dni) && !clients.has(c.dni)) clients.set(c.dni, c)
  const visits: CuikVisit[] = input.visits.filter((v) => !excluded.has(v.dni) && v.day <= END)
  const visitByKey = new Map<string, CuikVisit>()
  for (const v of visits) visitByKey.set(`${v.dni}|${v.day}`, v)
  const launch = [...clients.values()].map((c) => c.registeredOn).sort()[0] ?? null

  // --- Registration at the till (strict: a visit the same day) ---
  const minimum = options.minimumPurchase
  const byStore = new Map<string, { eligible: number; registered: number; otherLocal: number }>()
  const byMonth = new Map<string, { eligible: number; registered: number }>()
  const perClient = new Map<string, { eligible: number; registered: number; stores: Set<string> }>()
  let eligibleDays = 0
  let registeredDays = 0
  let smallDays = 0
  let smallDaysWithVisit = 0
  let matchedInSales = 0
  const purchaseKeys = new Set<string>()
  for (const [dni, b] of buyers) {
    const c = clients.get(dni)
    if (!c) continue
    matchedInSales++
    for (const [day, d] of b.byDay) {
      if (day < c.registeredOn || day > END) continue
      const key = `${dni}|${day}`
      purchaseKeys.add(key)
      const hit = visitByKey.get(key)
      if (minimum !== null && d.total < minimum) {
        smallDays++
        if (hit) smallDaysWithVisit++
        continue
      }
      eligibleDays++
      if (hit) registeredDays++
      const m = day.slice(0, 7)
      const bm = byMonth.get(m) ?? { eligible: 0, registered: 0 }
      bm.eligible++
      if (hit) bm.registered++
      byMonth.set(m, bm)
      const stores = d.stores.size ? d.stores : new Set(["(sin tienda)"])
      for (const s of stores) {
        const bs = byStore.get(s) ?? { eligible: 0, registered: 0, otherLocal: 0 }
        bs.eligible++
        if (hit) {
          bs.registered++
          if (hit.store && hit.store !== s && !sameStore(hit.store, s)) bs.otherLocal++
        }
        byStore.set(s, bs)
      }
      const pc = perClient.get(dni) ?? { eligible: 0, registered: 0, stores: new Set() }
      pc.eligible++
      if (hit) pc.registered++
      for (const s of d.stores) pc.stores.add(s)
      perClient.set(dni, pc)
    }
  }
  const buckets = { "100%": 0, "50-99%": 0, "1-49%": 0, "0%": 0 }
  const perClientRows: ImpactSummary["registration"]["perClient"] = []
  for (const [dni, pc] of perClient) {
    if (pc.eligible === 0) continue
    const p = pct(pc.registered, pc.eligible) ?? 0
    buckets[p >= 100 ? "100%" : p >= 50 ? "50-99%" : p > 0 ? "1-49%" : "0%"]++
    const c = clients.get(dni)
    perClientRows.push({
      dni,
      name: c?.name ?? buyers.get(dni)?.name ?? "",
      registeredOn: c?.registeredOn ?? "",
      eligible: pc.eligible,
      registered: pc.registered,
      pct: p,
      stores: storeList(pc.stores),
    })
  }
  perClientRows.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.eligible - a.eligible)

  // Visits per cashier; "orphan" = no purchase of that client that day in the file.
  const byCashier = new Map<
    string,
    { visits: number; qr: number; manual: number; orphan: number; stores: Set<string> }
  >()
  let orphanVisits = 0
  for (const v of visits) {
    if (!clients.has(v.dni)) continue
    const c = byCashier.get(v.cashier) ?? {
      visits: 0,
      qr: 0,
      manual: 0,
      orphan: 0,
      stores: new Set(),
    }
    c.visits++
    if (v.store) c.stores.add(v.store)
    const hasPurchase = buyers.get(v.dni)?.byDay.has(v.day) ?? false
    if (!hasPurchase) {
      c.orphan++
      orphanVisits++
    }
    if (v.source.toLowerCase().startsWith("qr")) c.qr++
    else c.manual++
    byCashier.set(v.cashier, c)
  }

  // --- Frequency before/after ---
  const regGaps: { before: number; after: number }[] = []
  const ctrlGaps: { before: number; after: number }[] = []
  for (const [dni, b] of buyers) {
    const c = clients.get(dni)
    if (c) {
      const before = b.days.filter((d) => d < c.registeredOn)
      const after = b.days.filter((d) => d >= c.registeredOn && d <= END)
      if (before.length >= 2 && after.length >= 2) {
        const gb = median(gapsOf(before))
        const ga = median(gapsOf(after))
        if (gb !== null && ga !== null) regGaps.push({ before: gb, after: ga })
      }
    } else if (launch) {
      const before = b.days.filter((d) => d < launch)
      const after = b.days.filter((d) => d >= launch && d <= END)
      if (before.length >= 2 && after.length >= 2) {
        const gb = median(gapsOf(before))
        const ga = median(gapsOf(after))
        if (gb !== null && ga !== null) ctrlGaps.push({ before: gb, after: ga })
      }
    }
  }
  const registeredFreq = {
    n: regGaps.length,
    gapBefore: median(regGaps.map((g) => g.before)),
    gapAfter: median(regGaps.map((g) => g.after)),
  }
  const controlFreq = {
    n: ctrlGaps.length,
    gapBefore: median(ctrlGaps.map((g) => g.before)),
    gapAfter: median(ctrlGaps.map((g) => g.after)),
  }
  // Purchases per year the card is worth: what registered clients do now vs
  // what they would do had they followed the control group's trend.
  let extraPurchasesPerYear: number | null = null
  if (
    registeredFreq.gapBefore &&
    registeredFreq.gapAfter &&
    controlFreq.gapBefore &&
    controlFreq.gapAfter
  ) {
    const expectedGap = registeredFreq.gapBefore * (controlFreq.gapAfter / controlFreq.gapBefore)
    extraPurchasesPerYear = Math.max(
      0,
      Math.round((365 / registeredFreq.gapAfter - 365 / expectedGap) * 10) / 10,
    )
  }
  const moneyPerYear =
    extraPurchasesPerYear !== null && avgTicket !== null
      ? Math.round(extraPurchasesPerYear * avgTicket * matchedInSales)
      : null

  // --- Retention ---
  const W = options.retentionDays
  const months: string[] = []
  if (from && to) {
    const [fy, fm] = from.split("-").map(Number)
    const [ty, tm] = to.split("-").map(Number)
    let y = fy
    let m = fm
    while (y < ty || (y === ty && m <= tm)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`
      const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      if (addDays(lastDay, W) <= END) months.push(ym)
      if (m === 12) {
        y++
        m = 1
      } else m++
    }
  }
  const cohorts: ImpactSummary["retention"]["cohorts"] = []
  for (const ym of months) {
    const acc = { all: [0, 0], card: [0, 0], noCard: [0, 0] }
    for (const b of buyers.values()) {
      const inMonth = b.days.filter((d) => d.startsWith(ym))
      if (inMonth.length === 0) continue
      const last = inMonth[inMonth.length - 1]
      const limit = addDays(last, W)
      const back = b.days.some((d) => d > last && d <= limit)
      const c = clients.get(b.dni)
      const hasCard = !!c && c.registeredOn <= last
      acc.all[0]++
      if (back) acc.all[1]++
      const k = hasCard ? "card" : "noCard"
      acc[k][0]++
      if (back) acc[k][1]++
    }
    cohorts.push({
      month: ym,
      cohort: acc.all[0],
      retained: pct(acc.all[1], acc.all[0]),
      cardCohort: acc.card[0],
      cardRetained: pct(acc.card[1], acc.card[0]),
      noCardCohort: acc.noCard[0],
      noCardRetained: pct(acc.noCard[1], acc.noCard[0]),
    })
  }
  const launchMonth = launch ? launch.slice(0, 7) : null
  const agg = (
    rows: typeof cohorts,
    pick: (r: (typeof cohorts)[number]) => [number, number | null],
  ) => {
    let cohort = 0
    let retained = 0
    for (const r of rows) {
      const [c, p] = pick(r)
      cohort += c
      retained += Math.round((c * (p ?? 0)) / 100)
    }
    return { cohort, retained: pct(retained, cohort) }
  }
  const beforeRows = launchMonth ? cohorts.filter((r) => r.month < launchMonth) : cohorts
  const afterRows = launchMonth ? cohorts.filter((r) => r.month >= launchMonth) : []
  const retentionBlock = {
    windowDays: W,
    cohorts,
    beforeLaunch: agg(beforeRows, (r) => [r.cohort, r.retained]),
    afterLaunch: {
      all: agg(afterRows, (r) => [r.cohort, r.retained]),
      card: agg(afterRows, (r) => [r.cardCohort, r.cardRetained]),
      noCard: agg(afterRows, (r) => [r.noCardCohort, r.noCardRetained]),
    },
    sameClient: sameClientRetention(buyers, clients, launch, END, W),
  }

  // --- Frequent buyers without a card (≥ 3 purchases in the last 12 months) ---
  const from12m = addDays(END, -365)
  const unregistered: ImpactSummary["unregisteredFrequent"]["list"] = []
  let unregSpend = 0
  for (const b of buyers.values()) {
    if (clients.has(b.dni)) continue
    const recent = b.days.filter((d) => d >= from12m)
    if (recent.length < 3) continue
    unregSpend += b.total
    unregistered.push({
      dni: b.dni,
      name: b.name,
      phone: b.phone,
      purchases12m: recent.length,
      medianGap: median(gapsOf(recent)),
      lastPurchase: recent[recent.length - 1],
      total: round2(b.total),
      stores: storeList(b.stores),
    })
  }
  unregistered.sort((a, b) => b.purchases12m - a.purchases12m)

  // --- Broken frequency: silence > 1.5× the client's usual gap (and ≤ a year) ---
  const broken: ImpactSummary["brokenFrequency"]["list"] = []
  for (const b of buyers.values()) {
    if (b.days.length < 3) continue
    const m = median(gapsOf(b.days))
    const last = b.days[b.days.length - 1]
    const silence = dayDiff(last, END)
    if (!m || silence <= 1.5 * m || silence > 365) continue
    broken.push({
      dni: b.dni,
      name: b.name,
      phone: b.phone,
      registered: clients.has(b.dni),
      purchases: b.days.length,
      medianGap: m,
      lastPurchase: last,
      silence,
      stores: storeList(b.stores),
    })
  }
  broken.sort((a, b) => b.purchases - a.purchases)

  return {
    version: 1,
    period: { from, to },
    options: { retentionDays: W, minimumPurchase: minimum, launch, phase: options.phase },
    coverage: {
      orders: orders.length,
      ordersWithDni: withDni,
      coveragePct: pct(withDni, orders.length),
      revenue: Math.round(revenue),
      avgTicket,
      uniqueDnis: buyers.size,
      byStore: [...storeCov]
        .map(([store, s]) => ({
          store,
          orders: s.orders,
          withDni: s.withDni,
          coveragePct: pct(s.withDni, s.orders),
          revenue: Math.round(s.revenue),
        }))
        .sort((a, b) => b.orders - a.orders),
      byMonth: [...monthCov]
        .sort()
        .map(([month, m]) => ({ month, orders: m.orders, revenue: Math.round(m.revenue) })),
    },
    staff: { detected: detectedStaff, manual: [...manualExcluded] },
    cuik: { clients: clients.size, matchedInSales, visitsConsidered: visits.length },
    registration: {
      eligibleDays,
      registeredDays,
      pct: pct(registeredDays, eligibleDays),
      smallDays,
      smallDaysWithVisit,
      orphanVisits,
      clientsWithEligible: perClientRows.length,
      buckets,
      byStore: [...byStore]
        .map(([store, b]) => ({ store, ...b, pct: pct(b.registered, b.eligible) }))
        .sort((a, b) => b.eligible - a.eligible),
      byMonth: [...byMonth]
        .sort()
        .map(([month, b]) => ({ month, ...b, pct: pct(b.registered, b.eligible) })),
      byCashier: [...byCashier]
        .map(([cashier, c]) => ({
          cashier,
          visits: c.visits,
          qr: c.qr,
          manual: c.manual,
          orphan: c.orphan,
          stores: storeList(c.stores),
        }))
        .sort((a, b) => b.visits - a.visits),
      perClient: perClientRows,
    },
    frequency: {
      registered: registeredFreq,
      control: controlFreq,
      extraPurchasesPerYear,
      cardClients: matchedInSales,
      moneyPerYear,
    },
    retention: retentionBlock,
    unregisteredFrequent: {
      count: unregistered.length,
      spend: Math.round(unregSpend),
      list: unregistered.slice(0, 5000),
    },
    brokenFrequency: {
      total: broken.length,
      registered: broken.filter((b) => b.registered).length,
      notRegistered: broken.filter((b) => !b.registered).length,
      list: broken.slice(0, 5000),
    },
  }
}

/** "Surco (Jacaranda)" and "Jacaranda": the same place when one name contains the other. */
function sameStore(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x.includes(y) || y.includes(x)
}

/**
 * Purchase-level retention of the same clients before and after: a purchase
 * is "retained" when the client bought again within the window. Registered
 * clients are cut at their own registration; the control group (never
 * registered) at the launch. Removes the "those who sign up already bought
 * more" bias of the cohort view.
 */
function sameClientRetention(
  buyers: Map<string, { dni: string; days: string[] }>,
  clients: Map<string, CuikClient>,
  launch: string | null,
  END: string,
  W: number,
): ImpactSummary["retention"]["sameClient"] {
  const empty: PurchaseRetention = { purchases: 0, pct: null }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: before/after loops over the same purchase list; splitting would repeat the window check
  const block = (cut: (dni: string) => string | null) => {
    let clientsN = 0
    let bB = 0
    let bR = 0
    let aB = 0
    let aR = 0
    for (const b of buyers.values()) {
      const c = cut(b.dni)
      if (!c) continue
      const before = b.days.filter((d) => d < c)
      const after = b.days.filter((d) => d >= c)
      if (before.length < 2 || after.length < 1) continue
      clientsN++
      for (const d of before) {
        bB++
        const next = b.days.find((x) => x > d)
        if (next && next <= addDays(d, W)) bR++
      }
      for (const d of after) {
        if (addDays(d, W) > END) continue
        aB++
        const next = b.days.find((x) => x > d)
        if (next && next <= addDays(d, W)) aR++
      }
    }
    return {
      clients: clientsN,
      before: bB ? { purchases: bB, pct: pct(bR, bB) } : empty,
      after: aB ? { purchases: aB, pct: pct(aR, aB) } : empty,
    }
  }
  return {
    registered: block((dni) => clients.get(dni)?.registeredOn ?? null),
    control: block((dni) => (clients.has(dni) ? null : launch)),
  }
}
