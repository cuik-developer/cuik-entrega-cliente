import {
  type ClientSegment,
  computeClientSegment,
  DEFAULT_THRESHOLDS,
  type SegmentationThresholds,
} from "@/lib/loyalty/client-segments"

/**
 * Impacto Loyalty: what a tenant's loyalty program shows with Cuik's own data
 * only (clients, stamped visits with the amount the cashier typed, and who got
 * each campaign). No sales file, no POS.
 *
 * Three levels, and the screen never mixes them:
 *   1. what happened        base, purchases, sales that went through the card
 *   2. what it is worth     how many come back and what a returning client leaves
 *   3. what followed        who came back after each send, and what they bought
 *
 * Campaigns are read AS OF THE SEND DAY. A client's segment today says nothing
 * about the campaign: someone who was "inactivo" when the message went out and
 * came back is, a month later, a client with visits. Every client's segment is
 * rebuilt from their visits up to the send day with the panel's own rules
 * (`computeClientSegment`), and the segment each one moved to is kept.
 *
 * Campaigns are described, not judged (decision of 21 Nov 2026): the screen
 * says who got each send and who came back inside the window, with no
 * comparison against clients left without a message. These merchants write to
 * everybody, often, so there is nobody to compare with, and holding clients
 * back as a control group costs sales. The credit goes to the program as a
 * whole, in the conclusion; what followed a send is part of the card sales
 * the conclusion starts from, never an amount added on top.
 *
 * One purchase, one campaign: a purchase belongs to the last message the client
 * got before it. A recipient who got a later message before coming back stays
 * in this campaign's count as "did not come back", and the purchase is the
 * later send's. That is what lets sends be added up without counting a
 * purchase twice.
 *
 * Everything here is a FLOOR: a purchase the cashier did not stamp does not
 * exist for Cuik. Comparisons between card holders still hold, because every
 * group misses stamps the same way.
 *
 * Pure: days arrive as "YYYY-MM-DD" in the tenant's timezone (see store.ts).
 */

export type ImpactClient = { id: string; registeredOn: string }
export type ImpactVisit = {
  clientId: string
  day: string
  /** Instant of the stamp (ms): orders a purchase and a message of the same day. */
  at: number
  amount: number | null
  cycle: number
  /** Welcome stamp given at sign-up: counts for the segment, never as a purchase. */
  bonus?: boolean
}

export const CAMPAIGN_KINDS = [
  "manual",
  "recurring",
  "birthday",
  "points_expiring",
  "churn",
] as const
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number]

export type ImpactCampaign = {
  id: string
  name: string
  kind: CampaignKind
  sentOn: string
  sentAt: number
  /** Clients the campaign actually reached (sent or delivered), no repeats. */
  recipients: string[]
}

export type LoyaltyImpactInput = {
  today: string
  clients: ImpactClient[]
  visits: ImpactVisit[]
  campaigns: ImpactCampaign[]
  /** Days a client has to come back after a campaign. */
  windowDays: number
  /** The tenant's segment rules, as the panel applies them. */
  thresholds?: SegmentationThresholds
}

export const SEGMENTS: readonly ClientSegment[] = [
  "nuevo",
  "frecuente",
  "esporadico",
  "regular",
  "one_time",
  "en_riesgo",
  "inactivo",
]

export const WINDOW_MIN = 5
export const WINDOW_MAX = 120
/** An amount this many times the typical ticket is a typing mistake, not a sale. */
export const OUTLIER_TIMES_MEDIAN = 100

/** One segment of a campaign's recipients, as they were on the send day. */
export type CampaignSegmentRow = {
  segment: ClientSegment
  recipients: number
  returned: number
  returnedPct: number | null
}

/**
 * What happened after one send: who got it and who came back inside the
 * window. It is not compared with anything: the program as a whole takes the
 * credit in the conclusion, and campaigns are part of the program.
 */
export type CampaignImpact = {
  id: string
  name: string
  kind: CampaignKind
  sentOn: string
  /** Clients the campaign reached. */
  recipients: number
  /** Of those, the ones who got a later message before coming back: their purchase is the later send's. */
  handedOver: number
  /** The window has fully passed; before that the numbers are still moving. */
  windowComplete: boolean
  returned: number
  returnedPct: number | null
  /** Purchases and sales this campaign answers for (up to the next message each client got). */
  purchasesInWindow: number
  salesInWindow: number
  /** Recipients by the segment they were in when the campaign went out. */
  bySegment: CampaignSegmentRow[]
  /** Recipients who came back: segment on the send day → segment when the window closed. */
  moves: Array<{ from: ClientSegment; to: ClientSegment; clients: number }>
}

/** One recipient of a campaign, for the client-by-client list. */
export type CampaignClientRow = {
  clientId: string
  segmentAtSend: ClientSegment
  /** Days since the last purchase on the send day; null = had never bought. */
  silenceDays: number | null
  purchasesAtSend: number
  /** Got a later message before coming back: that purchase belongs to the later campaign. */
  handedOver: boolean
  returnedOn: string | null
  purchases: number
  sales: number
  /** Segment when the window closed; null while it is still open. */
  segmentAtClose: ClientSegment | null
}

/** Every send of a kind together. */
export type CampaignKindSummary = {
  kind: CampaignKind
  /** Sends that reached somebody. */
  campaigns: number
  /** Of those, the ones whose window is still open: their numbers can still grow. */
  open: number
  /** Messages delivered: a client counts once per send. */
  deliveries: number
  /** Different clients who got at least one. */
  clients: number
  /** Different clients who came back after at least one, before their next message. */
  returned: number
  returnedPct: number | null
  purchases: number
  sales: number
}

export type LoyaltyImpact = {
  period: { from: string | null; to: string; months: number }
  windowDays: number
  /** Typical days between a client's purchases, and the window that suggests. */
  medianGapDays: number | null
  suggestedWindowDays: number
  quality: {
    purchases: number
    withAmount: number
    amountCoveragePct: number | null
    outliers: number
    outliersTotal: number
    outlierThreshold: number | null
    /** Welcome stamps left out of purchases and money. */
    bonusStamps: number
  }
  headline: {
    registered: number
    buyers: number
    sales: number
    purchases: number
    returnSales: number
    returnPurchases: number
    medianTicket: number | null
  }
  /** Clients grouped by how many days they bought: the "volvieron al menos X veces" filter. */
  byVisitDays: Array<{
    visitDays: number
    clients: number
    purchases: number
    sales: number
    returnPurchases: number
    returnSales: number
  }>
  funnel: Array<{
    step: "registered" | "first" | "second" | "third" | "fifth" | "card"
    clients: number
  }>
  base: {
    active30: number
    active60: number
    active90: number
    silent90plus: number
    neverBought: number
  }
  months: Array<{
    month: string
    newClients: number
    buyers: number
    firstVisits: number
    returnVisits: number
    sales: number
    returnSales: number
    returnSharePct: number | null
  }>
  /** After N days without coming, how many buy again within the window. */
  naturalReturn: Array<{
    silenceDays: number
    times: number
    back: number
    backPct: number | null
  }>
  campaigns: CampaignImpact[]
  byKind: CampaignKindSummary[]
  /**
   * All kinds together. Each purchase belongs to one send only (the last
   * message before it), so these add up without counting anything twice.
   */
  campaignTotals: {
    campaigns: number
    deliveries: number
    clients: number
    returned: number
    purchases: number
    sales: number
  }
  /** How many messages each client got in the current month. */
  pressure: { month: string; one: number; twoOrThree: number; fourPlus: number }
}

// ── helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
export const diffDays = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY_MS)
export const addDays = (day: string, n: number) =>
  new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10)
/** Noon UTC of a day: far from any midnight, so day arithmetic is exact. */
const noon = (day: string) => new Date(`${day}T12:00:00Z`)

const round1 = (n: number) => Math.round(n * 10) / 10
const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}

/** First index whose value is greater than `x` in a sorted list (binary search). */
function firstAfter<T>(list: readonly T[], x: number | string, key: (item: T) => number | string) {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (key(list[mid] as T) <= x) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function clampWindow(days: number): number {
  if (!Number.isFinite(days)) return 30
  return Math.min(WINDOW_MAX, Math.max(WINDOW_MIN, Math.round(days)))
}

/** A window a bit longer than the usual gap between purchases, rounded to 5 days. */
export function suggestWindow(medianGapDays: number | null): number {
  if (medianGapDays === null) return 30
  return Math.min(90, Math.max(7, Math.ceil((medianGapDays * 1.25) / 5) * 5))
}

/** Typical days between one client's purchases, straight from the raw visits. */
export function typicalGapDays(
  visits: ReadonlyArray<{ clientId: string; day: string; bonus?: boolean }>,
) {
  const days = new Map<string, Set<string>>()
  for (const v of visits) {
    if (v.bonus) continue
    const set = days.get(v.clientId) ?? new Set<string>()
    set.add(v.day)
    days.set(v.clientId, set)
  }
  const gaps: number[] = []
  for (const set of days.values()) {
    const sorted = [...set].sort()
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(diffDays(sorted[i - 1] as string, sorted[i] as string))
    }
  }
  return median(gaps)
}

/** A purchase after cleaning: the amount is 0 when missing or discarded. */
type Buy = { day: string; at: number; amount: number; cycle: number }
/**
 * One client's history, oldest first. `stampDays` has one entry per stamp
 * (welcome stamps included): what the panel's segment counts. `buys` and
 * `days` are real purchases only.
 */
type ClientVisits = { stampDays: string[]; buys: Buy[]; days: string[] }
type Reach = { campaignId: string; at: number; day: string }
const NO_VISITS: ClientVisits = { stampDays: [], buys: [], days: [] }

type Tally = Record<ClientSegment, { n: number; back: number }>
const emptyTally = (): Tally =>
  Object.fromEntries(SEGMENTS.map((s) => [s, { n: 0, back: 0 }])) as Tally

/** First purchase after an instant, up to the end of `until`. */
function firstBuyAfter(buys: Buy[], at: number, until: string): Buy | null {
  const next = buys[firstAfter(buys, at, (b) => b.at)]
  return next !== undefined && next.day <= until ? next : null
}

/**
 * The client's segment on `day`, rebuilt from the stamps up to that day with
 * the panel's own rules (stamp count, last stamp, average gap between stamps).
 */
export function segmentOn(
  registeredOn: string,
  stampDays: readonly string[],
  day: string,
  thresholds: SegmentationThresholds,
): ClientSegment {
  const count = firstAfter(stampDays, day, (d) => d)
  const first = count > 0 ? (stampDays[0] as string) : null
  const last = count > 0 ? (stampDays[count - 1] as string) : null
  return computeClientSegment(
    {
      createdAt: noon(registeredOn),
      totalVisits: count,
      lastVisitAt: last === null ? null : noon(last),
      avgDaysBetweenVisits:
        count > 1 && first !== null && last !== null ? diffDays(first, last) / (count - 1) : null,
    },
    thresholds,
    noon(day),
  )
}

// ── level 1 and 2 ────────────────────────────────────────────────────

/** Splits stamps into purchases and welcome stamps, and drops typing mistakes from the money. */
function groupByClient(raw: ImpactVisit[]) {
  const typed = raw.filter((v) => !v.bonus && (v.amount ?? 0) > 0).map((v) => v.amount as number)
  const typical = median(typed)
  const threshold = typical === null ? null : typical * OUTLIER_TIMES_MEDIAN
  let outliers = 0
  let outliersTotal = 0
  let bonusStamps = 0
  const byClient = new Map<string, ClientVisits>()
  for (const v of [...raw].sort((a, b) => a.at - b.at || a.day.localeCompare(b.day))) {
    let entry = byClient.get(v.clientId)
    if (!entry) {
      entry = { stampDays: [], buys: [], days: [] }
      byClient.set(v.clientId, entry)
    }
    entry.stampDays.push(v.day)
    if (v.bonus) {
      bonusStamps++
      continue
    }
    let amount = v.amount !== null && v.amount > 0 ? v.amount : 0
    if (threshold !== null && amount > threshold) {
      outliers++
      outliersTotal += amount
      amount = 0
    }
    entry.buys.push({ day: v.day, at: v.at, amount, cycle: v.cycle })
  }
  for (const entry of byClient.values()) {
    entry.stampDays.sort()
    entry.days = [...new Set(entry.buys.map((b) => b.day))].sort()
  }
  return { byClient, outliers, outliersTotal, threshold, bonusStamps }
}

function monthly(clients: ImpactClient[], buyers: Array<[string, ClientVisits]>) {
  type Month = {
    newClients: number
    buyers: Set<string>
    first: number
    back: number
    sales: number
    backSales: number
  }
  const map = new Map<string, Month>()
  const at = (ym: string) => {
    let m = map.get(ym)
    if (!m) {
      m = { newClients: 0, buyers: new Set(), first: 0, back: 0, sales: 0, backSales: 0 }
      map.set(ym, m)
    }
    return m
  }
  for (const c of clients) at(c.registeredOn.slice(0, 7)).newClients++
  for (const [clientId, entry] of buyers) {
    const first = entry.days[0]
    for (const b of entry.buys) {
      const m = at(b.day.slice(0, 7))
      m.buyers.add(clientId)
      m.sales += b.amount
      if (b.day === first) m.first++
      else {
        m.back++
        m.backSales += b.amount
      }
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, m]) => ({
      month: ym,
      newClients: m.newClients,
      buyers: m.buyers.size,
      firstVisits: m.first,
      returnVisits: m.back,
      sales: Math.round(m.sales),
      returnSales: Math.round(m.backSales),
      returnSharePct: pct(m.backSales, m.sales),
    }))
}

/** Clients by number of purchase days, with what they bought on the first day and after. */
function groupByVisitDays(entries: ClientVisits[]) {
  type Row = LoyaltyImpact["byVisitDays"][number]
  const map = new Map<number, Row>()
  for (const e of entries) {
    const row = map.get(e.days.length) ?? {
      visitDays: e.days.length,
      clients: 0,
      purchases: 0,
      sales: 0,
      returnPurchases: 0,
      returnSales: 0,
    }
    row.clients++
    const first = e.days[0]
    for (const b of e.buys) {
      row.purchases++
      row.sales += b.amount
      if (b.day !== first) {
        row.returnPurchases++
        row.returnSales += b.amount
      }
    }
    map.set(e.days.length, row)
  }
  return [...map.values()]
    .sort((a, b) => a.visitDays - b.visitDays)
    .map((r) => ({ ...r, sales: Math.round(r.sales), returnSales: Math.round(r.returnSales) }))
}

/** Calendar months from the first activity to today, both included. */
function monthsBetween(from: string | null, to: string): number {
  if (from === null || from > to) return 0
  const [y1, m1] = from.split("-").map(Number) as [number, number]
  const [y2, m2] = to.split("-").map(Number) as [number, number]
  return (y2 - y1) * 12 + (m2 - m1) + 1
}

// ── level 3 ──────────────────────────────────────────────────────────

/**
 * A client completes N days without buying; how often do they buy again in the
 * next `windowDays`? (Whatever happened in those days, campaigns included: it
 * is what is normal in this tenant.)
 */
function naturalReturnAfterSilence(entries: ClientVisits[], today: string, windowDays: number) {
  return [30, 45, 60, 90].map((silenceDays) => {
    let times = 0
    let back = 0
    for (const e of entries) {
      for (let i = 0; i < e.days.length; i++) {
        const mark = addDays(e.days[i] as string, silenceDays)
        const next = e.days[i + 1]
        if (next !== undefined && next <= mark) continue
        const until = addDays(mark, windowDays)
        if (until >= today) continue
        times++
        if (next !== undefined && next <= until) back++
      }
    }
    return { silenceDays, times, back, backPct: pct(back, times) }
  })
}

type Context = {
  today: string
  windowDays: number
  thresholds: SegmentationThresholds
  clients: ImpactClient[]
  registeredOn: Map<string, string>
  byClient: Map<string, ClientVisits>
  /** Every message each client got, oldest first. */
  reaches: Map<string, Reach[]>
}

function reachesByClient(campaigns: ImpactCampaign[]): Map<string, Reach[]> {
  const map = new Map<string, Reach[]>()
  for (const c of campaigns) {
    for (const clientId of new Set(c.recipients)) {
      const list = map.get(clientId) ?? []
      list.push({ campaignId: c.id, at: c.sentAt, day: c.sentOn })
      map.set(clientId, list)
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.at - b.at)
  return map
}

/**
 * The next message of another campaign the client got inside the window, if
 * any. Two sends at the very same instant are ordered by id, so one of them is
 * "the last" and a purchase is never counted for both.
 */
function laterMessage(c: ImpactCampaign, clientId: string, until: string, ctx: Context) {
  const list = ctx.reaches.get(clientId)
  if (!list) return null
  for (let i = firstAfter(list, c.sentAt - 1, (r) => r.at); i < list.length; i++) {
    const r = list[i] as Reach
    if (r.day > until) return null
    if (r.campaignId === c.id) continue
    if (r.at === c.sentAt && r.campaignId < c.id) continue
    return r
  }
  return null
}

/** What one recipient did after a campaign, up to the next message they got. */
function followRecipient(c: ImpactCampaign, clientId: string, until: string, ctx: Context) {
  const entry = ctx.byClient.get(clientId) ?? NO_VISITS
  const registeredOn = ctx.registeredOn.get(clientId) as string
  const firstBack = firstBuyAfter(entry.buys, c.sentAt, until)
  const later = laterMessage(c, clientId, until, ctx)
  const handedOver = later !== null && (firstBack === null || later.at <= firstBack.at)
  const cut = later === null ? Number.POSITIVE_INFINITY : later.at

  const before = firstAfter(entry.buys, c.sentAt, (b) => b.at)
  let purchases = 0
  let sales = 0
  for (let i = before; i < entry.buys.length; i++) {
    const b = entry.buys[i] as Buy
    if (b.day > until || b.at >= cut) break
    purchases++
    sales += b.amount
  }
  const last = before > 0 ? (entry.buys[before - 1] as Buy).day : null
  const windowComplete = until < ctx.today
  return {
    clientId,
    segmentAtSend: segmentOn(registeredOn, entry.stampDays, c.sentOn, ctx.thresholds),
    silenceDays: last === null ? null : diffDays(last, c.sentOn),
    purchasesAtSend: before,
    handedOver,
    returnedOn: handedOver ? null : (firstBack?.day ?? null),
    purchases,
    sales: Math.round(sales * 100) / 100,
    segmentAtClose: windowComplete
      ? segmentOn(registeredOn, entry.stampDays, until, ctx.thresholds)
      : null,
  } satisfies CampaignClientRow
}

const reachedOf = (c: ImpactCampaign, ctx: Context) =>
  new Set(c.recipients.filter((id) => (ctx.registeredOn.get(id) ?? "9") <= c.sentOn))

/** Kept apart from the public shape: what the summary by kind needs from each campaign. */
type Measured = CampaignImpact & { reachedIds: string[]; returnedIds: string[] }

function measureCampaign(c: ImpactCampaign, ctx: Context): Measured {
  const until = addDays(c.sentOn, ctx.windowDays)
  const rows = [...reachedOf(c, ctx)].map((id) => followRecipient(c, id, until, ctx))
  const back = rows.filter((r) => r.returnedOn !== null)

  const mine = emptyTally()
  const moves = new Map<string, number>()
  for (const r of rows) {
    mine[r.segmentAtSend].n++
    if (r.returnedOn === null) continue
    mine[r.segmentAtSend].back++
    if (r.segmentAtClose !== null) {
      const key = `${r.segmentAtSend}>${r.segmentAtClose}`
      moves.set(key, (moves.get(key) ?? 0) + 1)
    }
  }

  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    sentOn: c.sentOn,
    recipients: rows.length,
    handedOver: rows.filter((r) => r.handedOver).length,
    windowComplete: until < ctx.today,
    returned: back.length,
    returnedPct: pct(back.length, rows.length),
    purchasesInWindow: sum(rows.map((r) => r.purchases)),
    salesInWindow: Math.round(sum(rows.map((r) => r.sales))),
    bySegment: SEGMENTS.filter((segment) => mine[segment].n > 0)
      .map((segment) => ({
        segment,
        recipients: mine[segment].n,
        returned: mine[segment].back,
        returnedPct: pct(mine[segment].back, mine[segment].n),
      }))
      .sort((a, b) => b.recipients - a.recipients),
    moves: [...moves.entries()]
      .map(([key, clients]) => {
        const [from, to] = key.split(">") as [ClientSegment, ClientSegment]
        return { from, to, clients }
      })
      .sort((a, b) => b.clients - a.clients),
    reachedIds: rows.map((r) => r.clientId),
    returnedIds: back.map((r) => r.clientId),
  }
}

/** Sends, messages, different clients and what followed, for a group of campaigns. */
function totalsOf(campaigns: Measured[]) {
  const clients = new Set(campaigns.flatMap((c) => c.reachedIds))
  const returned = new Set(campaigns.flatMap((c) => c.returnedIds))
  return {
    campaigns: campaigns.length,
    deliveries: sum(campaigns.map((c) => c.recipients)),
    clients: clients.size,
    returned: returned.size,
    purchases: sum(campaigns.map((c) => c.purchasesInWindow)),
    sales: sum(campaigns.map((c) => c.salesInWindow)),
  }
}

/** Every send of a kind together: a client who got five weekly pushes is one client. */
function summarizeKinds(campaigns: Measured[]): CampaignKindSummary[] {
  return CAMPAIGN_KINDS.flatMap((kind) => {
    const all = campaigns.filter((c) => c.kind === kind && c.recipients > 0)
    if (all.length === 0) return []
    const totals = totalsOf(all)
    return [
      {
        kind,
        ...totals,
        open: all.filter((c) => !c.windowComplete).length,
        returnedPct: pct(totals.returned, totals.clients),
      },
    ]
  })
}

function messagePressure(campaigns: ImpactCampaign[], today: string) {
  const month = today.slice(0, 7)
  const counts = new Map<string, number>()
  for (const c of campaigns) {
    if (c.sentOn.slice(0, 7) !== month) continue
    for (const id of new Set(c.recipients)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const values = [...counts.values()]
  return {
    month,
    one: values.filter((n) => n === 1).length,
    twoOrThree: values.filter((n) => n === 2 || n === 3).length,
    fourPlus: values.filter((n) => n >= 4).length,
  }
}

// ── the report ───────────────────────────────────────────────────────

function buildContext(input: LoyaltyImpactInput) {
  const { today } = input
  const windowDays = clampWindow(input.windowDays)
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  // A migrated client can carry stamps older than their row in Cuik: they were
  // a client from the first one, or campaigns before that date would not count them.
  const firstStamp = new Map<string, string>()
  for (const v of input.visits) {
    const known = firstStamp.get(v.clientId)
    if (known === undefined || v.day < known) firstStamp.set(v.clientId, v.day)
  }
  const clients = input.clients
    .map((c) => {
      const first = firstStamp.get(c.id)
      return first !== undefined && first < c.registeredOn ? { ...c, registeredOn: first } : c
    })
    .filter((c) => c.registeredOn <= today)
  const registeredOn = new Map(clients.map((c) => [c.id, c.registeredOn]))
  const grouped = groupByClient(
    input.visits.filter((v) => v.day <= today && registeredOn.has(v.clientId)),
  )
  const campaigns = input.campaigns.filter((c) => c.sentOn <= today)
  let firstDay: string | null = null
  for (const e of grouped.byClient.values()) {
    const first = e.days[0]
    if (first !== undefined && (firstDay === null || first < firstDay)) firstDay = first
  }
  const ctx: Context = {
    today,
    windowDays,
    thresholds,
    clients,
    registeredOn,
    byClient: grouped.byClient,
    reaches: reachesByClient(campaigns),
  }
  return { ctx, grouped, campaigns, firstDay }
}

/** The client-by-client list of one campaign (ids only; the store adds the names). */
export function campaignClients(
  input: LoyaltyImpactInput,
  campaignId: string,
): CampaignClientRow[] | null {
  const { ctx, campaigns } = buildContext(input)
  const c = campaigns.find((x) => x.id === campaignId)
  if (!c) return null
  const until = addDays(c.sentOn, ctx.windowDays)
  return [...reachedOf(c, ctx)].map((id) => followRecipient(c, id, until, ctx))
}

export function computeLoyaltyImpact(input: LoyaltyImpactInput): LoyaltyImpact {
  const { ctx, grouped, campaigns: sent, firstDay } = buildContext(input)
  const { today, windowDays, clients, byClient } = ctx
  const buyers = [...byClient.entries()].filter(([, e]) => e.buys.length > 0)
  const entries = buyers.map(([, e]) => e)
  const buys = entries.flatMap((e) => e.buys)

  const withAmount = buys.filter((b) => b.amount > 0)
  const ticket = median(withAmount.map((b) => b.amount))
  const months = monthly(clients, buyers)
  const byVisitDays = groupByVisitDays(entries)
  const withDays = (n: number) => entries.filter((e) => e.days.length >= n).length
  const silences = entries.map((e) => diffDays(e.days[e.days.length - 1] ?? today, today))
  const within = (days: number) => silences.filter((d) => d <= days).length
  const medianGap = median(
    entries.flatMap((e) => e.days.slice(1).map((d, i) => diffDays(e.days[i] as string, d))),
  )
  const firstActivity = clients.reduce<string | null>(
    (a, c) => (a === null || c.registeredOn < a ? c.registeredOn : a),
    firstDay,
  )

  const measured = [...sent].sort((a, b) => b.sentAt - a.sentAt).map((c) => measureCampaign(c, ctx))
  const byKind = summarizeKinds(measured)

  return {
    period: { from: firstDay, to: today, months: monthsBetween(firstActivity, today) },
    windowDays,
    medianGapDays: medianGap === null ? null : round1(medianGap),
    suggestedWindowDays: suggestWindow(medianGap),
    quality: {
      purchases: buys.length,
      withAmount: withAmount.length,
      amountCoveragePct: pct(withAmount.length, buys.length),
      outliers: grouped.outliers,
      outliersTotal: Math.round(grouped.outliersTotal),
      outlierThreshold: grouped.threshold === null ? null : Math.round(grouped.threshold),
      bonusStamps: grouped.bonusStamps,
    },
    headline: {
      registered: clients.length,
      buyers: entries.length,
      sales: sum(byVisitDays.map((b) => b.sales)),
      purchases: buys.length,
      returnSales: sum(byVisitDays.map((b) => b.returnSales)),
      returnPurchases: sum(byVisitDays.map((b) => b.returnPurchases)),
      medianTicket: ticket === null ? null : Math.round(ticket * 100) / 100,
    },
    byVisitDays,
    funnel: [
      { step: "registered", clients: clients.length },
      { step: "first", clients: withDays(1) },
      { step: "second", clients: withDays(2) },
      { step: "third", clients: withDays(3) },
      { step: "fifth", clients: withDays(5) },
      { step: "card", clients: entries.filter((e) => e.buys.some((b) => b.cycle >= 2)).length },
    ],
    base: {
      active30: within(30),
      active60: within(60),
      active90: within(90),
      silent90plus: silences.length - within(90),
      neverBought: clients.length - entries.length,
    },
    months,
    naturalReturn: naturalReturnAfterSilence(entries, today, windowDays),
    campaigns: measured.map(({ reachedIds, returnedIds, ...c }) => c),
    byKind,
    campaignTotals: totalsOf(measured.filter((c) => c.recipients > 0)),
    pressure: messagePressure(sent, today),
  }
}

// ── the conclusion ───────────────────────────────────────────────────

export type ImpactAssumptions = {
  /** Share of the return-visit sales that would not have happened without the card (0–100). */
  factorPct: number
  /** The merchant's average margin (0–100). */
  marginPct: number
  /** What the merchant pays Cuik each month. */
  monthlyFee: number
}

/**
 * "The program generated about S/ X": the return-visit sales times the factor.
 * Campaigns add nothing on top: the program takes the credit as a whole. What
 * followed a send is part of the card sales (and of the return-visit sales,
 * except when it was the client's first purchase). The range goes from half to
 * one and a half times the factor.
 */
export function concludeImpact(impact: LoyaltyImpact, a: ImpactAssumptions) {
  const factor = Math.min(1, Math.max(0, a.factorPct / 100))
  const margin = Math.min(1, Math.max(0, a.marginPct / 100))
  const { returnSales, returnPurchases } = impact.headline
  const generated = returnSales * factor
  const paid = Math.max(0, a.monthlyFee) * impact.period.months
  const profit = generated * margin
  return {
    generated: Math.round(generated),
    low: Math.round(returnSales * factor * 0.5),
    high: Math.round(returnSales * Math.min(1, factor * 1.5)),
    purchases: Math.round(returnPurchases * factor),
    profit: Math.round(profit),
    paid: Math.round(paid),
    salesPerSol: paid > 0 ? round1(generated / paid) : null,
    profitPerSol: paid > 0 ? round1(profit / paid) : null,
  }
}
