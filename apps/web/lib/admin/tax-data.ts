import {
  and,
  db,
  desc,
  documents,
  eq,
  gte,
  inArray,
  issuers,
  lte,
  ne,
  sql,
  taxProfiles,
  tenantBilling,
  tenantInvoices,
  tenants,
  uitValues,
} from "@cuik/db"
import { asInterval, billingOutlook } from "./billing"
import { currentMonthLima } from "./company-data"
import { docSign, toPen } from "./documents"
import { fxForMonth, invoicesWithoutSale } from "./documents-data"
import { monthRange } from "./finance"
import { issuerForMonth, profileForMonth, splitIgv } from "./issuers"
import {
  annualEstimate,
  EMPTY_MONTH,
  type MonthDocs,
  monthsTax,
  monthTax,
  reserveRate,
  sumMonths,
  type TaxProfileLike,
} from "./tax"

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Last day of a "YYYY-MM" month as "YYYY-MM-DD". */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y ?? 2000, m ?? 1, 0))
  return d.toISOString().slice(0, 10)
}

/** Documents of an issuer between two tax periods, added up per month in soles. */
async function docsByMonth(issuerId: string, from: string, to: string) {
  const rows = await db
    .select({
      direction: documents.direction,
      docType: documents.docType,
      taxPeriod: documents.taxPeriod,
      currency: documents.currency,
      fxRate: documents.fxRate,
      baseGravada: documents.baseGravada,
      baseNoGravada: documents.baseNoGravada,
      igv: documents.igv,
      total: documents.total,
      igvTreatment: documents.igvTreatment,
      rentaDeductible: documents.rentaDeductible,
    })
    .from(documents)
    .where(
      and(
        eq(documents.issuerId, issuerId),
        eq(documents.status, "registered"),
        gte(documents.taxPeriod, from),
        lte(documents.taxPeriod, to),
      ),
    )
  const byMonth = new Map<string, MonthDocs>()
  for (const r of rows) {
    const k = docSign(r.docType)
    const fx = r.fxRate === null ? null : Number(r.fxRate)
    const pen = (n: string) => k * toPen(Number(n), r.currency, fx)
    const base = pen(r.baseGravada) + pen(r.baseNoGravada)
    const igv = pen(r.igv)
    const add: MonthDocs =
      r.direction === "sale"
        ? { ...EMPTY_MONTH, salesBase: base, salesIgv: igv, salesTotal: pen(r.total) }
        : {
            ...EMPTY_MONTH,
            purchaseIgvCredit: r.igvTreatment === "credito" ? igv : 0,
            purchaseIgvPending:
              r.igvTreatment === "representacion" || r.igvTreatment === "no_domiciliado" ? igv : 0,
            purchaseBaseDeductible:
              r.rentaDeductible === "si" || r.rentaDeductible === "limitado" ? base : 0,
          }
    byMonth.set(r.taxPeriod, sumMonths(byMonth.get(r.taxPeriod) ?? EMPTY_MONTH, add))
  }
  return byMonth
}

/**
 * What is still to invoice in `month`, for the projection ("si emito todo lo
 * pendiente, este mes pago…"):
 *  - merchants whose next invoice falls due by the end of the month by their
 *    own billing rule (mode, day, periodicity, the same outlook as the
 *    Facturación tab), with no invoice issued that month and no sale
 *    registered for them that month;
 *  - invoices already registered in Facturación this month that are not in
 *    Ventas yet (their amount, not the tariff).
 */
async function toBillIn(month: string, igvRate: number) {
  const end = monthEnd(month)
  const [configs, invoices, sales, fx] = await Promise.all([
    db
      .select({
        tenantId: tenants.id,
        name: tenants.name,
        amount: tenantBilling.monthlyAmount,
        currency: tenantBilling.currency,
        includesIgv: tenantBilling.amountIncludesIgv,
        serviceStartOn: tenantBilling.serviceStartOn,
        billingDay: tenantBilling.billingDay,
        billingMode: tenantBilling.billingMode,
        interval: tenantBilling.billingIntervalMonths,
      })
      .from(tenantBilling)
      .innerJoin(tenants, eq(tenants.id, tenantBilling.tenantId))
      .where(
        and(
          inArray(tenants.status, ["active", "trial", "expired"]),
          sql`${tenantBilling.monthlyAmount} > 0`,
          lte(tenantBilling.serviceStartOn, end),
        ),
      ),
    db
      .select({
        id: tenantInvoices.id,
        tenantId: tenantInvoices.tenantId,
        period: tenantInvoices.period,
        months: tenantInvoices.months,
        issuedOn: tenantInvoices.issuedOn,
        amount: tenantInvoices.amount,
        currency: tenantInvoices.currency,
        documentId: tenantInvoices.documentId,
        tenantName: tenants.name,
      })
      .from(tenantInvoices)
      .innerJoin(tenants, eq(tenants.id, tenantInvoices.tenantId))
      .where(ne(tenantInvoices.status, "void")),
    db
      .select({ tenantId: documents.tenantId })
      .from(documents)
      .where(
        and(
          eq(documents.direction, "sale"),
          eq(documents.status, "registered"),
          eq(documents.taxPeriod, month),
          ne(documents.docType, "07"),
        ),
      ),
    fxForMonth(db, month),
  ])

  const issuedThisMonth = new Set(
    invoices.filter((i) => i.issuedOn.slice(0, 7) === month).map((i) => i.tenantId),
  )
  const soldThisMonth = new Set(sales.map((s) => s.tenantId).filter(Boolean))
  const invoicesOf = new Map<string, { period: string; months: number }[]>()
  for (const i of invoices) {
    invoicesOf.set(i.tenantId, [...(invoicesOf.get(i.tenantId) ?? []), i])
  }
  const includesOf = new Map(configs.map((c) => [c.tenantId, c.includesIgv]))

  const row = (
    tenantId: string,
    name: string,
    amount: number,
    currency: "PEN" | "USD",
    includesIgv: boolean,
    source: "tarifa" | "factura",
  ) => {
    const s = splitIgv(
      toPen(amount, currency, currency === "USD" ? fx : null),
      includesIgv,
      igvRate,
    )
    return {
      tenantId,
      name,
      amount,
      currency,
      includesIgv,
      source,
      base: s.base,
      igv: s.igv,
      total: s.total,
    }
  }

  const due = configs
    .filter((c) => !issuedThisMonth.has(c.tenantId) && !soldThisMonth.has(c.tenantId))
    .filter((c) => {
      const o = billingOutlook(
        {
          serviceStartOn: c.serviceStartOn,
          billingDay: c.billingDay,
          billingMode: c.billingMode,
          intervalMonths: asInterval(c.interval),
        },
        invoicesOf.get(c.tenantId) ?? [],
        end,
      )
      return o.status === "pendiente" || o.status === "vencida"
    })
    .map((c) => row(c.tenantId, c.name, Number(c.amount), c.currency, c.includesIgv, "tarifa"))

  const registeredWithoutSale = invoices
    .filter((i) => i.issuedOn.slice(0, 7) === month && !i.documentId)
    .map((i) =>
      row(
        i.tenantId,
        i.tenantName,
        Number(i.amount),
        i.currency,
        includesOf.get(i.tenantId) ?? true,
        "factura",
      ),
    )
  return [...due, ...registeredWithoutSale]
}

/**
 * Finanzas › Resumen fiscal for `month`: the month's taxes with what is
 * registered and with what is still to invoice, the year month by month and
 * the annual estimate against the reserve.
 */
export async function loadTaxSummary(month: string) {
  const issuerRows = await db.select().from(issuers)
  const issuer = issuerForMonth(issuerRows, month)
  const profileRows = issuer
    ? await db.select().from(taxProfiles).where(eq(taxProfiles.issuerId, issuer.id))
    : []
  const profiles = profileRows.map((p) => ({
    id: p.id,
    issuerId: p.issuerId,
    fromMonth: p.fromMonth,
    regime: p.regime,
    validatedByAccountant: p.validatedByAccountant,
    igvRate: Number(p.igvRate),
    monthlyRate: Number(p.monthlyRate),
    annualBrackets: p.annualBrackets ?? [],
  }))
  const profile = issuer ? profileForMonth(profiles, issuer.id, month) : null
  if (!issuer || !profile) {
    return {
      month,
      today: currentMonthLima(),
      available: false as const,
      issuer: issuer ? { razonSocial: issuer.razonSocial, ruc: issuer.ruc } : null,
    }
  }

  // IGV saldo a favor carries across years, so the run starts at the first
  // month with a regime; the year panels then keep only this year.
  const year = month.slice(0, 4)
  const firstProfileMonth = profiles
    .map((p) => p.fromMonth)
    .filter((m) => m <= month)
    .sort()[0] as string
  const from = [firstProfileMonth, issuer.fromMonth ?? firstProfileMonth].sort().at(-1) as string
  const months = monthRange(from, month)
  const profileFor = (m: string): TaxProfileLike | null => profileForMonth(profiles, issuer.id, m)

  const [byMonth, pendingInvoices, uitRow, toBill] = await Promise.all([
    docsByMonth(issuer.id, from, month),
    invoicesWithoutSale(month),
    db
      .select()
      .from(uitValues)
      // The year's UIT, else the latest earlier one (flagged in the screen).
      .where(lte(uitValues.year, Number(year)))
      .orderBy(desc(uitValues.year))
      .limit(1),
    toBillIn(month, profile.igvRate),
  ])
  const docsFor = (m: string) => byMonth.get(m) ?? EMPTY_MONTH
  const allRows = monthsTax(months, docsFor, profileFor)
  const yearRows = allRows.filter((r) => r.month.startsWith(`${year}-`))
  const current = allRows.find((r) => r.month === month) ?? monthTax(month, EMPTY_MONTH, profile, 0)

  const projectedDocs: MonthDocs = toBill.reduce(
    (acc, t) =>
      sumMonths(acc, { ...EMPTY_MONTH, salesBase: t.base, salesIgv: t.igv, salesTotal: t.total }),
    docsFor(month),
  )
  const projected = monthTax(month, projectedDocs, profile, current.igvCreditCarried)
  const uit = uitRow[0] ? Number(uitRow[0].value) : null
  const uitYear = uitRow[0]?.year ?? null

  return {
    month,
    today: currentMonthLima(),
    available: true as const,
    issuer: { razonSocial: issuer.razonSocial, ruc: issuer.ruc },
    profile: {
      regime: profile.regime,
      validatedByAccountant: profile.validatedByAccountant,
      igvRate: profile.igvRate,
      monthlyRate: profile.monthlyRate,
      reserveRate: reserveRate(profile),
      annualBrackets: profile.annualBrackets,
    },
    current,
    projected,
    toBill,
    pendingInvoices,
    yearRows,
    annual: { year, uit, uitYear, ...annualEstimate(yearRows, profile, uit) },
    reserveTotal: round2(yearRows.reduce((a, r) => a + r.annualReserve, 0)),
  }
}

export type TaxSummary = Awaited<ReturnType<typeof loadTaxSummary>>
