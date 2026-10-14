/**
 * Finance ledger math (pure). Everything is expressed in soles: USD amounts
 * use the rate typed for that month, else the latest earlier month, else
 * `DEFAULT_USD_PEN` (flagged as estimated).
 *
 * Two views coexist for every month:
 *  - cash: money that actually moved that month (an annual invoice paid in
 *    October is all October income; a quarterly cost paid in January is all
 *    January).
 *  - accrual: the same amounts spread over the months they pay for, so a
 *    quarter shows a third each month. Each item chooses its own treatment
 *    through `recognition` ("spread" follows the accrual view in both; "cash"
 *    counts everything in the month paid in both views).
 */

import { shiftMonth } from "./billing"

export const DEFAULT_USD_PEN = 3.75

export type Currency = "PEN" | "USD"
export type Recognition = "spread" | "cash"
export type FxRates = Record<string, number> // "YYYY-MM" → USD→PEN

export type RecurringLike = {
  type: "cost" | "income"
  category: string
  name: string
  amount: number
  currency: Currency
  everyMonths: number
  fromMonth: string
  toMonth: string | null
  recognition: Recognition
  active: boolean
}
export type EntryLike = {
  type: "cost" | "income" | "contribution" | "return"
  category: string
  name: string
  amount: number
  currency: Currency
  month: string
  months: number
  recognition: Recognition
}
export type LoanLike = {
  name: string
  principal: number
  currency: Currency
  installment: number
  installments: number
  firstMonth: string
}
/** A merchant invoice as the ledger sees it. */
export type InvoiceLike = {
  period: string
  months: number
  amount: number
  currency: Currency
  recognition: Recognition
  status: "pending" | "paid" | "void"
  /** "YYYY-MM-DD" | null */
  paidOn: string | null
  issuedOn: string
}

export type MonthRow = {
  month: string
  /** Merchant invoices + other incomes, money received that month. */
  incomeCash: number
  /** Same incomes spread over the months they pay for. */
  incomeAccrual: number
  /** Fixed + variable costs paid that month (loan installments excluded). */
  costCash: number
  costAccrual: number
  /** Loan installments due that month. */
  loanPayments: number
  /** Partner money put in (+) that month. */
  contributions: number
  /** Money paid back to the partner that month. */
  returns: number
  /** incomeCash − costCash − loanPayments: what the month needed from the partner when negative. */
  netCash: number
  /** incomeAccrual − costAccrual − loanPayments. */
  netAccrual: number
  /** True when some USD amount used the default rate (no rate typed yet). */
  fxEstimated: boolean
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = shiftMonth(m, 1)) {
    out.push(m)
    if (out.length > 600) break
  }
  return out
}

/** Months between two "YYYY-MM" (b − a). */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number)
  const [yb, mb] = b.split("-").map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/** Rate for a month: typed, else the latest earlier one, else the default. */
export function fxFor(month: string, rates: FxRates): { rate: number; estimated: boolean } {
  if (rates[month]) return { rate: rates[month], estimated: false }
  const earlier = Object.keys(rates)
    .filter((m) => m < month)
    .sort()
  if (earlier.length > 0) return { rate: rates[earlier[earlier.length - 1]], estimated: false }
  return { rate: DEFAULT_USD_PEN, estimated: true }
}

function toPen(amount: number, currency: Currency, month: string, rates: FxRates) {
  if (currency === "PEN") return { pen: amount, estimated: false }
  const { rate, estimated } = fxFor(month, rates)
  return { pen: round2(amount * rate), estimated }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Installment schedule of a loan: month → amount in its own currency. */
export function loanSchedule(
  loan: LoanLike,
): { month: string; amount: number; balanceAfter: number }[] {
  const rows: { month: string; amount: number; balanceAfter: number }[] = []
  for (let k = 0; k < loan.installments; k++) {
    rows.push({
      month: shiftMonth(loan.firstMonth, k),
      amount: loan.installment,
      balanceAfter: round2(Math.max(0, loan.principal - loan.installment * (k + 1))),
    })
  }
  return rows
}

/** Remaining balance of a loan at the end of `month` (principal − installments due so far). */
export function loanBalanceAt(loan: LoanLike, month: string): number {
  const paid = Math.min(Math.max(0, monthDiff(loan.firstMonth, month) + 1), loan.installments)
  return round2(Math.max(0, loan.principal - loan.installment * paid))
}

/** Months a recurring item is charged (its own payment months) within [from, to]. */
export function recurringChargeMonths(item: RecurringLike, from: string, to: string): string[] {
  if (!item.active) return []
  const out: string[] = []
  const last = item.toMonth && item.toMonth < to ? item.toMonth : to
  for (let m = item.fromMonth; m <= last; m = shiftMonth(m, item.everyMonths)) {
    if (m >= from) out.push(m)
    if (out.length > 600) break
  }
  return out
}

type Bucket = { cash: number; accrual: number; estimated: boolean }

function emptyBucket(): Bucket {
  return { cash: 0, accrual: 0, estimated: false }
}

/** Adds an amount paid in `payMonth` covering `months` months to the buckets (per month). */
function spread(
  buckets: Map<string, Bucket>,
  payMonth: string,
  months: number,
  amount: number,
  currency: Currency,
  recognition: Recognition,
  rates: FxRates,
  from: string,
  to: string,
) {
  const paid = toPen(amount, currency, payMonth, rates)
  const add = (m: string, cash: number, accrual: number) => {
    if (m < from || m > to) return
    const b = buckets.get(m) ?? emptyBucket()
    b.cash += cash
    b.accrual += accrual
    b.estimated = b.estimated || paid.estimated
    buckets.set(m, b)
  }
  add(payMonth, paid.pen, recognition === "cash" || months <= 1 ? paid.pen : 0)
  if (recognition === "spread" && months > 1) {
    const slice = paid.pen / months
    for (let k = 0; k < months; k++) add(shiftMonth(payMonth, k), 0, slice)
  }
}

export function buildLedger(input: {
  from: string
  to: string
  rates: FxRates
  recurring: RecurringLike[]
  entries: EntryLike[]
  loans: LoanLike[]
  invoices: InvoiceLike[]
}): MonthRow[] {
  const { from, to, rates } = input
  const income = new Map<string, Bucket>()
  const cost = new Map<string, Bucket>()
  const loan = new Map<string, Bucket>()
  const contrib = new Map<string, number>()
  const ret = new Map<string, number>()

  // Merchant invoices: accrual spreads every live invoice from its first
  // covered month; cash counts paid ones in the month they were paid.
  for (const inv of input.invoices) {
    if (inv.status === "void") continue
    const months = Math.max(1, inv.months)
    const payMonth = (inv.paidOn ?? inv.issuedOn).slice(0, 7)
    const paid = toPen(inv.amount, inv.currency, payMonth, rates)
    const bump = (m: string, cash: number, accrual: number) => {
      if (m < from || m > to) return
      const b = income.get(m) ?? emptyBucket()
      b.cash += cash
      b.accrual += accrual
      b.estimated = b.estimated || paid.estimated
      income.set(m, b)
    }
    if (inv.status === "paid") bump(payMonth, paid.pen, 0)
    if (inv.recognition === "cash") {
      if (inv.status === "paid") bump(payMonth, 0, paid.pen)
    } else {
      const slice = paid.pen / months
      for (let k = 0; k < months; k++) bump(shiftMonth(inv.period, k), 0, slice)
    }
  }

  for (const r of input.recurring) {
    // Look back far enough that a charge before `from` still spreads into the window.
    const lookback = shiftMonth(from, -Math.max(0, r.everyMonths - 1))
    for (const m of recurringChargeMonths(r, lookback, to)) {
      spread(
        r.type === "cost" ? cost : income,
        m,
        r.everyMonths,
        r.amount,
        r.currency,
        r.recognition,
        rates,
        from,
        to,
      )
    }
  }

  for (const e of input.entries) {
    if (e.type === "contribution" || e.type === "return") {
      if (e.month < from || e.month > to) continue
      const { pen } = toPen(e.amount, e.currency, e.month, rates)
      const map = e.type === "contribution" ? contrib : ret
      map.set(e.month, (map.get(e.month) ?? 0) + pen)
      continue
    }
    spread(
      e.type === "cost" ? cost : income,
      e.month,
      e.months,
      e.amount,
      e.currency,
      e.recognition,
      rates,
      from,
      to,
    )
  }

  for (const l of input.loans) {
    for (const s of loanSchedule(l)) {
      if (s.month < from || s.month > to) continue
      const { pen, estimated } = toPen(s.amount, l.currency, s.month, rates)
      const b = loan.get(s.month) ?? emptyBucket()
      b.cash += pen
      b.accrual += pen
      b.estimated = b.estimated || estimated
      loan.set(s.month, b)
    }
  }

  return monthRange(from, to).map((month) => {
    const i = income.get(month) ?? emptyBucket()
    const c = cost.get(month) ?? emptyBucket()
    const l = loan.get(month) ?? emptyBucket()
    const contributions = round2(contrib.get(month) ?? 0)
    const returns = round2(ret.get(month) ?? 0)
    return {
      month,
      incomeCash: round2(i.cash),
      incomeAccrual: round2(i.accrual),
      costCash: round2(c.cash),
      costAccrual: round2(c.accrual),
      loanPayments: round2(l.cash),
      contributions,
      returns,
      netCash: round2(i.cash - c.cash - l.cash),
      netAccrual: round2(i.accrual - c.accrual - l.cash),
      fxEstimated: i.estimated || c.estimated || l.estimated,
    }
  })
}

export type LedgerTotals = {
  incomeCash: number
  incomeAccrual: number
  costCash: number
  costAccrual: number
  loanPayments: number
  contributions: number
  returns: number
  netCash: number
  netAccrual: number
}

export function sumLedger(rows: MonthRow[]): LedgerTotals {
  const t: LedgerTotals = {
    incomeCash: 0,
    incomeAccrual: 0,
    costCash: 0,
    costAccrual: 0,
    loanPayments: 0,
    contributions: 0,
    returns: 0,
    netCash: 0,
    netAccrual: 0,
  }
  for (const r of rows) {
    t.incomeCash += r.incomeCash
    t.incomeAccrual += r.incomeAccrual
    t.costCash += r.costCash
    t.costAccrual += r.costAccrual
    t.loanPayments += r.loanPayments
    t.contributions += r.contributions
    t.returns += r.returns
    t.netCash += r.netCash
    t.netAccrual += r.netAccrual
  }
  for (const k of Object.keys(t) as (keyof LedgerTotals)[]) t[k] = round2(t[k])
  return t
}

/**
 * Merchants needed to cover a monthly outflow at a given average ticket
 * (null when the ticket is zero). Rounds up: 862 / 250 → 4.
 */
export function breakEvenMerchants(monthlyOutflowPen: number, avgTicketPen: number): number | null {
  if (avgTicketPen <= 0) return null
  return Math.ceil(monthlyOutflowPen / avgTicketPen)
}

/**
 * Partner position over time: investment put in (contributions + the months
 * where cash was negative are already contributions when registered), returns
 * received, and the month the cumulative net cash recovers the investment.
 */
export function investmentRecovery(
  rows: MonthRow[],
  openingInvestment = 0,
): { invested: number; returned: number; outstanding: number; recoveredIn: string | null } {
  // Recovered when what the business itself generated (Σ net cash, before any
  // partner money) reaches everything the partner put in so far.
  let invested = openingInvestment
  let returned = 0
  let generated = 0
  let recoveredIn: string | null = null
  for (const r of rows) {
    invested += r.contributions
    returned += r.returns
    generated += r.netCash
    if (recoveredIn === null && invested > 0 && generated >= invested) recoveredIn = r.month
  }
  return {
    invested: round2(invested),
    returned: round2(returned),
    outstanding: round2(Math.max(0, invested - returned)),
    recoveredIn,
  }
}
