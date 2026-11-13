/**
 * Monthly taxes of Cuik (pure), as the accountant asked to run them under
 * MYPE Tributario:
 *
 *  - IGV: débito (IGV of sales) − crédito (IGV of purchases with credit) −
 *    saldo a favor carried from the previous month. Not Cuik's money: it is
 *    collected from the merchant and handed to SUNAT.
 *  - Pago a cuenta de renta: ventas sin IGV × monthly rate (1 %), paid with
 *    the PDT 621 every month.
 *  - Reserva para la renta anual: ventas sin IGV × the first annual bracket
 *    (10 %), set aside every month in the bank so the annual return (paid in
 *    March–April of the next year) never lands on a single month.
 *
 * The PDT 621 is declared in whole soles, so what is paid is rounded; the
 * reserve is kept exact. Every rate comes from the tax profile.
 */

export type TaxProfileLike = {
  igvRate: number
  monthlyRate: number
  annualBrackets: { upToUit: number | null; rate: number }[]
}

/** What the documents of one month add up to, in soles, credit notes already subtracted. */
export type MonthDocs = {
  /** Taxable sales without IGV (base gravada) + non-taxable sales. */
  salesBase: number
  /** IGV of sales (débito fiscal). */
  salesIgv: number
  /** Sales total with IGV (what is invoiced). */
  salesTotal: number
  /** IGV of purchases marked "con crédito fiscal" in this tax period. */
  purchaseIgvCredit: number
  /** IGV of purchases the accountant still has to rule on (representación, no domiciliados). */
  purchaseIgvPending: number
  /** Purchase base deductible for renta (si + limitado), for the annual estimate. */
  purchaseBaseDeductible: number
}

export const EMPTY_MONTH: MonthDocs = {
  salesBase: 0,
  salesIgv: 0,
  salesTotal: 0,
  purchaseIgvCredit: 0,
  purchaseIgvPending: 0,
  purchaseBaseDeductible: 0,
}

export type MonthTax = MonthDocs & {
  month: string
  /** Saldo a favor de IGV coming from the previous month. */
  igvCreditCarried: number
  /** IGV to pay this month (PDT, whole soles). */
  igvToPay: number
  /** Saldo a favor that goes to next month (exact). */
  igvCreditNext: number
  /** Pago a cuenta de renta (PDT, whole soles). */
  incomeAdvance: number
  /** Exact amounts before rounding, to show the arithmetic. */
  igvToPayExact: number
  incomeAdvanceExact: number
  /** Set aside for the annual income tax (exact, not declared). */
  annualReserve: number
  /** Paid to SUNAT this month: IGV + pago a cuenta. */
  payToSunat: number
  /** Paid + set aside: what leaves the operating money this month. */
  totalSetAside: number
  /** Invoiced (with IGV) minus everything above: what is left for Cuik. */
  netForCuik: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
/** PDT 621 amounts are whole soles. */
export const pdtRound = (n: number) => Math.round(n)

/** The reserve rate: the first annual bracket (10 % in MYPE Tributario); 0 when the regime has no annual tax (RER). */
export function reserveRate(profile: TaxProfileLike): number {
  return profile.annualBrackets[0]?.rate ?? 0
}

export function sumMonths(a: MonthDocs, b: MonthDocs): MonthDocs {
  return {
    salesBase: round2(a.salesBase + b.salesBase),
    salesIgv: round2(a.salesIgv + b.salesIgv),
    salesTotal: round2(a.salesTotal + b.salesTotal),
    purchaseIgvCredit: round2(a.purchaseIgvCredit + b.purchaseIgvCredit),
    purchaseIgvPending: round2(a.purchaseIgvPending + b.purchaseIgvPending),
    purchaseBaseDeductible: round2(a.purchaseBaseDeductible + b.purchaseBaseDeductible),
  }
}

/** Taxes of one month given its documents, its profile and the IGV credit carried in. */
export function monthTax(
  month: string,
  docs: MonthDocs,
  profile: TaxProfileLike,
  igvCreditCarried: number,
): MonthTax {
  const igvBalance = round2(docs.salesIgv - docs.purchaseIgvCredit - igvCreditCarried)
  const igvToPayExact = Math.max(0, igvBalance)
  const igvCreditNext = Math.max(0, round2(-igvBalance))
  const incomeAdvanceExact = round2(Math.max(0, docs.salesBase) * profile.monthlyRate)
  const igvToPay = pdtRound(igvToPayExact)
  // Round once, from the exact product (2.495 → S/ 2, not 2.50 → S/ 3).
  const incomeAdvance = pdtRound(Math.max(0, docs.salesBase) * profile.monthlyRate)
  const annualReserve = round2(Math.max(0, docs.salesBase) * reserveRate(profile))
  const payToSunat = igvToPay + incomeAdvance
  const totalSetAside = round2(payToSunat + annualReserve)
  return {
    month,
    ...docs,
    igvCreditCarried: round2(igvCreditCarried),
    igvToPay,
    igvCreditNext,
    incomeAdvance,
    igvToPayExact,
    incomeAdvanceExact,
    annualReserve,
    payToSunat,
    totalSetAside,
    netForCuik: round2(docs.salesTotal - totalSetAside),
  }
}

/**
 * Month after month from the first one, carrying the IGV saldo a favor.
 * `profileFor` returns null for a month without regime (skipped: no carry).
 */
export function monthsTax(
  months: string[],
  docsFor: (month: string) => MonthDocs,
  profileFor: (month: string) => TaxProfileLike | null,
): MonthTax[] {
  const out: MonthTax[] = []
  let carried = 0
  for (const m of months) {
    const profile = profileFor(m)
    if (!profile) {
      carried = 0
      continue
    }
    const row = monthTax(m, docsFor(m), profile, carried)
    carried = row.igvCreditNext
    out.push(row)
  }
  return out
}

/** Income tax by brackets over net income; null without a UIT for brackets that need it. */
export function annualIncomeTax(
  netIncome: number,
  brackets: TaxProfileLike["annualBrackets"],
  uit: number | null,
): number | null {
  if (netIncome <= 0 || brackets.length === 0) return 0
  let rest = netIncome
  let floor = 0
  let tax = 0
  for (const b of brackets) {
    if (b.upToUit === null) {
      tax += rest * b.rate
      rest = 0
      break
    }
    if (uit === null) return null
    const ceiling = b.upToUit * uit
    const slice = Math.min(rest, Math.max(0, ceiling - floor))
    tax += slice * b.rate
    rest -= slice
    floor = ceiling
    if (rest <= 0) break
  }
  return round2(tax)
}

/**
 * The year so far: what the annual return would ask (tax on profit minus the
 * advances already paid) next to what was set aside. The accountant's
 * reserve (10 % of sales) ignores costs, so it normally covers the real
 * amount with room to spare.
 */
export function annualEstimate(rows: MonthTax[], profile: TaxProfileLike, uit: number | null) {
  const income = round2(rows.reduce((a, r) => a + r.salesBase, 0))
  const deductible = round2(rows.reduce((a, r) => a + r.purchaseBaseDeductible, 0))
  const netIncome = round2(income - deductible)
  const tax = annualIncomeTax(netIncome, profile.annualBrackets, uit)
  const advances = rows.reduce((a, r) => a + r.incomeAdvance, 0)
  const reserved = round2(rows.reduce((a, r) => a + r.annualReserve, 0))
  const balanceDue = tax === null ? null : round2(Math.max(0, tax - advances))
  return {
    income,
    deductible,
    netIncome,
    tax,
    advances,
    balanceDue,
    reserved,
    /** Reserve left after paying the estimated balance (negative = short). */
    reserveMargin: balanceDue === null ? null : round2(reserved - balanceDue),
  }
}
