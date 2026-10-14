import { db, eq, prospects, sql, tenantBilling, tenantInvoices, tenants } from "@cuik/db"
import { asInterval, coveredThrough, shiftMonth, todayYmd } from "./billing"
import {
  breakEvenMerchants,
  buildLedger,
  type Currency,
  type ExpectedBillingLike,
  fxFor,
  investmentRecovery,
  type LedgerRow,
  type LedgerTotals,
  loanBalanceAt,
  round2,
  sumLedger,
  withCumulative,
} from "./finance"
import { loadLedgerInputs } from "./finance-data"
import { type ProspectLike, prospectMonthlyPen, prospectsToExpected } from "./prospects"

/** Fallback ticket when no merchant pays yet: the basic plan (S/ 79). */
const DEFAULT_TICKET_PEN = 79
/** Default window: this far back, and 12 months ahead. */
const MAX_LOOKBACK_MONTHS = 24
const DEFAULT_LOOKBACK_MONTHS = 5
const PROJECTION_MONTHS = 12

export type ExpectedMerchant = ExpectedBillingLike & {
  tenantId: string
  name: string
  status: string
  /** Income per month in soles at today's rate (amount / interval). */
  monthlyPen: number
}

export type FinanceDashboard = {
  range: { from: string; to: string; todayMonth: string }
  /** Months inside the window; the cumulative carries the balance since the first record. */
  rows: LedgerRow[]
  totals: {
    /** Window months up to and including the current one. */
    toDate: LedgerTotals
    /** Window months after the current one. */
    projected: LedgerTotals
    all: LedgerTotals
  }
  /** The current month, whatever the window. */
  current: LedgerRow | null
  fx: { rate: number; estimated: boolean }
  merchants: {
    /** Merchants whose service already started and who have an amount set. */
    paying: number
    expectedMonthlyPen: number
    list: {
      name: string
      monthlyPen: number
      status: string
      startMonth: string
      /** Set for open prospects folded into the projection (weighted by this). */
      probability?: number
    }[]
  }
  /** Open prospects folded into the projection (0 when the toggle is off). */
  prospectsIncluded: number
  breakEven: {
    /** This month's fixed costs (recurring, as they accrue) plus loan installments, in soles. */
    outflowPen: number
    ticketPen: number
    ticketIsDefault: boolean
    merchantsNeeded: number | null
  }
  loans: {
    id: string
    name: string
    currency: Currency
    installment: number
    balance: number
    balancePen: number
    remaining: number
    lastMonth: string
  }[]
  /** Over the whole history (first record → window end), not just the window. */
  recovery: {
    invested: number
    returned: number
    outstanding: number
    cashOnHand: number
    recoveredIn: string | null
    /** True when `recoveredIn` is after the current month (depends on the projection). */
    projected: boolean
  }
}

/**
 * Billing terms of every merchant that can still produce invoices (active or
 * in trial, with an amount and a service start), plus the first month no live
 * invoice covers. Feeds the projection of months not invoiced yet.
 */
export async function loadExpectedBilling(): Promise<ExpectedMerchant[]> {
  const configs = await db
    .select({
      tenantId: tenants.id,
      name: tenants.name,
      status: tenants.status,
      amount: tenantBilling.monthlyAmount,
      currency: tenantBilling.currency,
      interval: tenantBilling.billingIntervalMonths,
      mode: tenantBilling.billingMode,
      start: tenantBilling.serviceStartOn,
    })
    .from(tenantBilling)
    .innerJoin(tenants, eq(tenants.id, tenantBilling.tenantId))
    .where(
      sql`${tenantBilling.monthlyAmount} IS NOT NULL AND ${tenantBilling.monthlyAmount} > 0 AND ${tenantBilling.serviceStartOn} IS NOT NULL AND ${tenants.status} IN ('active', 'trial')`,
    )
  if (configs.length === 0) return []
  const idList = sql.join(
    configs.map((c) => sql`${c.tenantId}::uuid`),
    sql`, `,
  )
  const invoiced = await db
    .select({
      tenantId: tenantInvoices.tenantId,
      period: tenantInvoices.period,
      months: tenantInvoices.months,
    })
    .from(tenantInvoices)
    .where(sql`${tenantInvoices.tenantId} IN (${idList}) AND ${tenantInvoices.status} <> 'void'`)
  const byTenant = new Map<string, { period: string; months: number }[]>()
  for (const i of invoiced) {
    byTenant.set(i.tenantId, [...(byTenant.get(i.tenantId) ?? []), i])
  }
  return configs.map((c) => {
    const startMonth = (c.start as string).slice(0, 7)
    return {
      tenantId: c.tenantId,
      name: c.name,
      status: c.status,
      amount: Number(c.amount),
      currency: c.currency,
      intervalMonths: asInterval(c.interval),
      billingMode: c.mode,
      startMonth,
      firstUncovered: coveredThrough(startMonth, byTenant.get(c.tenantId) ?? []),
      monthlyPen: 0, // filled by the dashboard with the month's rate
    }
  })
}

/** Open prospects with terms, for the weighted projection. */
export async function loadOpenProspects(): Promise<
  (ProspectLike & { name: string; tenantId: string | null })[]
> {
  const rows = await db
    .select({
      name: prospects.name,
      tenantId: prospects.tenantId,
      stage: prospects.stage,
      probability: prospects.probability,
      monthlyAmount: prospects.monthlyAmount,
      currency: prospects.currency,
      intervalMonths: prospects.intervalMonths,
      billingMode: prospects.billingMode,
      expectedStartMonth: prospects.expectedStartMonth,
      demoEndOn: prospects.demoEndOn,
      nextStepOn: prospects.nextStepOn,
    })
    .from(prospects)
    .where(
      sql`${prospects.stage} IN ('lead', 'demo_scheduled', 'demo_done', 'proposal', 'negotiation', 'standby') AND ${prospects.monthlyAmount} > 0 AND ${prospects.expectedStartMonth} IS NOT NULL`,
    )
  return rows.map((r) => ({
    ...r,
    monthlyAmount: r.monthlyAmount === null ? null : Number(r.monthlyAmount),
    intervalMonths: asInterval(r.intervalMonths),
  }))
}

function minMonth(months: (string | null | undefined)[]): string | null {
  let out: string | null = null
  for (const m of months) if (m && (out === null || m < out)) out = m
  return out
}
function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + m
}

/** Everything the Tablero shows for a window, in soles. */
export async function buildFinanceDashboard(opts: {
  from?: string
  to?: string
  ticket?: number
  today?: string
  /** Fold open prospects into the projection, weighted by probability. */
  includeProspects?: boolean
}): Promise<FinanceDashboard> {
  const today = opts.today ?? todayYmd()
  const todayMonth = today.slice(0, 7)
  const [inputs, expectedRaw, openProspects] = await Promise.all([
    loadLedgerInputs(),
    loadExpectedBilling(),
    opts.includeProspects ? loadOpenProspects() : Promise.resolve([]),
  ])

  const fx = fxFor(todayMonth, inputs.rates)
  const expected: ExpectedMerchant[] = expectedRaw.map((e) => ({
    ...e,
    monthlyPen: round2(
      (e.currency === "USD" ? e.amount * fx.rate : e.amount) / Math.max(1, e.intervalMonths),
    ),
  }))
  // A prospect whose linked tenant already has billing terms is projected
  // through the tenant at 100 %; counting it again weighted would double it.
  const billedTenants = new Set(expectedRaw.map((e) => e.tenantId))
  const unlinked = openProspects.filter((p) => !p.tenantId || !billedTenants.has(p.tenantId))
  const prospectExpected = prospectsToExpected(unlinked, todayMonth)
  const prospectList = unlinked
    .filter((p) => p.probability > 0)
    .map((p) => ({
      name: p.name,
      monthlyPen: round2((prospectMonthlyPen(p, fx.rate) * p.probability) / 100),
      status: p.stage,
      startMonth:
        p.expectedStartMonth && p.expectedStartMonth > todayMonth
          ? p.expectedStartMonth
          : shiftMonth(todayMonth, 1),
      probability: p.probability,
    }))

  // Window: by default from the earliest thing on record (capped) to 12 months ahead.
  const earliest = minMonth([
    ...inputs.recurring.map((r) => r.fromMonth),
    ...inputs.loans.map((l) => l.firstMonth),
    ...inputs.entries.map((e) => e.month),
    ...inputs.invoices.filter((i) => i.status !== "void").map((i) => i.period),
    ...expected.map((e) => e.startMonth),
  ])
  const floor = shiftMonth(todayMonth, -MAX_LOOKBACK_MONTHS)
  const defaultFrom =
    earliest && earliest < todayMonth
      ? earliest < floor
        ? floor
        : earliest
      : shiftMonth(todayMonth, -DEFAULT_LOOKBACK_MONTHS)
  const from = opts.from ?? defaultFrom
  const defaultTo = shiftMonth(todayMonth, PROJECTION_MONTHS)
  const to = opts.to ?? (from > defaultTo ? shiftMonth(from, PROJECTION_MONTHS) : defaultTo)

  // The ledger runs over the whole history so the cumulative, the recovery and
  // the current month do not depend on the window the user is looking at.
  const historyFrom = minMonth([earliest, from, todayMonth]) as string
  const historyTo = [to, todayMonth].sort()[1]
  const history = withCumulative(
    buildLedger({
      ...inputs,
      expected: [...expected, ...prospectExpected],
      from: historyFrom,
      to: historyTo,
      todayMonth,
    }),
  )
  const rows = history.filter((r) => r.month >= from && r.month <= to)
  const current = history.find((r) => r.month === todayMonth) ?? null

  const paying = expected.filter((e) => e.startMonth <= todayMonth)
  const expectedMonthlyPen = round2(paying.reduce((a, e) => a + e.monthlyPen, 0))
  const ticketIsDefault = opts.ticket === undefined
  const ticketPen =
    opts.ticket ??
    (paying.length > 0 ? round2(expectedMonthlyPen / paying.length) : DEFAULT_TICKET_PEN)
  // Monthly outflow at today's terms: recurring costs as they accrue plus loan
  // installments. One-off costs are left out: they are not what has to be
  // covered every month.
  const [fixed] = buildLedger({
    ...inputs,
    entries: [],
    invoices: [],
    expected: [],
    from: todayMonth,
    to: todayMonth,
    todayMonth,
  })
  const outflowPen = round2((fixed?.costAccrual ?? 0) + (fixed?.loanPayments ?? 0))

  const loans = inputs.loans.map((l, idx) => {
    const paid = Math.min(
      l.installments,
      Math.max(0, monthIndex(todayMonth) - monthIndex(l.firstMonth) + 1),
    )
    const balance = loanBalanceAt(l, todayMonth)
    return {
      id: String((l as { id?: string }).id ?? idx),
      name: l.name,
      currency: l.currency,
      installment: l.installment,
      balance,
      balancePen: l.currency === "USD" ? round2(balance * fx.rate) : balance,
      remaining: l.installments - paid,
      lastMonth: shiftMonth(l.firstMonth, l.installments - 1),
    }
  })

  // Position today (what was put in, returned and is in the till) from the real
  // months only; the recovery month may fall in the projected ones.
  const position = investmentRecovery(history.filter((r) => r.month <= todayMonth))
  const recovery = { ...position, recoveredIn: investmentRecovery(history).recoveredIn }

  return {
    range: { from, to, todayMonth },
    rows,
    totals: {
      toDate: sumLedger(rows.filter((r) => r.month <= todayMonth)),
      projected: sumLedger(rows.filter((r) => r.month > todayMonth)),
      all: sumLedger(rows),
    },
    current,
    fx,
    merchants: {
      paying: paying.length,
      expectedMonthlyPen,
      list: [
        ...expected
          .map((e) => ({
            name: e.name,
            monthlyPen: e.monthlyPen,
            status: e.status,
            startMonth: e.startMonth,
          }))
          .sort((a, b) => b.monthlyPen - a.monthlyPen),
        ...prospectList.sort((a, b) => b.monthlyPen - a.monthlyPen),
      ],
    },
    prospectsIncluded: prospectExpected.length,
    breakEven: {
      outflowPen,
      ticketPen,
      ticketIsDefault,
      merchantsNeeded: outflowPen > 0 ? breakEvenMerchants(outflowPen, ticketPen) : null,
    },
    loans,
    recovery: {
      ...recovery,
      projected: recovery.recoveredIn !== null && recovery.recoveredIn > todayMonth,
    },
  }
}
