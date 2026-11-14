import { db, desc, eq, fxRates, ne, tenantBilling, tenantInvoices, tenants } from "@cuik/db"
import { asInterval, daysBetween, periodLabel, todayYmd } from "./billing"
import { billingDueRows, summarize } from "./billing-overview"
import { currentMonthLima, loadIssuers } from "./company-data"
import { fiscalIssuerFor } from "./documents-data"
import { fxFor } from "./finance"
import { issuerForMonth } from "./issuers"

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Age buckets of an unpaid invoice, by days since it was issued. */
export type AgeBucket = "al_dia" | "mas_7" | "mas_30"
export function ageBucket(days: number): AgeBucket {
  if (days > 30) return "mas_30"
  if (days > 7) return "mas_7"
  return "al_dia"
}

/**
 * Finanzas › Cobranza: every merchant invoice in one place — what is due to
 * be issued (by each merchant's billing rule), what is issued and unpaid
 * (with its age), and what was collected lately — plus what the "Registrar
 * factura" dialog needs, so nobody has to open each merchant to bill it.
 */
export async function loadCollections() {
  const today = todayYmd()
  const month = currentMonthLima()
  const [dueRows, invoiceRows, billingRows, issuerRows, rateRows, fiscal] = await Promise.all([
    billingDueRows(today),
    db
      .select({
        id: tenantInvoices.id,
        tenantId: tenantInvoices.tenantId,
        tenantName: tenants.name,
        period: tenantInvoices.period,
        months: tenantInvoices.months,
        issuedOn: tenantInvoices.issuedOn,
        number: tenantInvoices.number,
        amount: tenantInvoices.amount,
        currency: tenantInvoices.currency,
        status: tenantInvoices.status,
        paidOn: tenantInvoices.paidOn,
        invoiceFileKey: tenantInvoices.invoiceFileKey,
        receiptFileKey: tenantInvoices.receiptFileKey,
        documentId: tenantInvoices.documentId,
      })
      .from(tenantInvoices)
      .innerJoin(tenants, eq(tenants.id, tenantInvoices.tenantId))
      .where(ne(tenantInvoices.status, "void"))
      .orderBy(desc(tenantInvoices.issuedOn)),
    db
      .select({
        tenantId: tenantBilling.tenantId,
        name: tenants.name,
        status: tenants.status,
        monthlyAmount: tenantBilling.monthlyAmount,
        currency: tenantBilling.currency,
        interval: tenantBilling.billingIntervalMonths,
        includesIgv: tenantBilling.amountIncludesIgv,
        issuerOverride: tenantBilling.issuerId,
        ruc: tenantBilling.ruc,
      })
      .from(tenantBilling)
      .innerJoin(tenants, eq(tenants.id, tenantBilling.tenantId)),
    loadIssuers(),
    db.select({ month: fxRates.month, usdPen: fxRates.usdPen }).from(fxRates),
    fiscalIssuerFor(db, month),
  ])
  const rates: Record<string, number> = {}
  for (const r of rateRows) rates[r.month] = Number(r.usdPen)
  const toPenNow = (amount: number, currency: "PEN" | "USD") =>
    currency === "USD" ? amount * fxFor(month, rates).rate : amount
  const billingOf = new Map(billingRows.map((b) => [b.tenantId, b]))
  /** Who issued (or issues) an invoice: a sale document means the month's issuer; else the override, else the month. */
  const issuerName = (tenantId: string, ymd: string, hasSale = false) => {
    const override = billingOf.get(tenantId)?.issuerOverride
    const i =
      override && !hasSale
        ? issuerRows.find((x) => x.id === override)
        : issuerForMonth(issuerRows, ymd.slice(0, 7))
    return i?.razonSocial ?? null
  }

  const { overdue, dueSoon } = summarize(dueRows)
  const toIssue = [...overdue, ...dueSoon].map((r) => {
    const o = r.outlook
    const period =
      (o.status === "pendiente" || o.status === "vencida" ? o.currentPeriod : o.nextPeriod) ?? null
    const due = o.status === "pendiente" || o.status === "vencida" ? o.currentDue : o.nextDue
    return {
      tenantId: r.tenantId,
      tenantName: r.tenantName,
      status: o.status,
      period,
      periodLabel: period ? periodLabel(period, o.intervalMonths) : null,
      months: o.intervalMonths,
      due,
      daysOverdue: o.daysOverdue,
      daysUntil: o.daysUntilNext,
      amount: o.monthlyAmount,
      currency: o.currency,
    }
  })

  const pending = invoiceRows
    .filter((i) => i.status === "pending")
    .map((i) => {
      const days = Math.max(0, daysBetween(i.issuedOn, today))
      return {
        id: i.id,
        tenantId: i.tenantId,
        tenantName: i.tenantName,
        periodLabel: periodLabel(i.period, asInterval(i.months)),
        issuedOn: i.issuedOn,
        number: i.number,
        amount: Number(i.amount),
        currency: i.currency,
        days,
        bucket: ageBucket(days),
        issuer: issuerName(i.tenantId, i.issuedOn, !!i.documentId),
        hasInvoiceFile: !!i.invoiceFileKey,
        hasReceiptFile: !!i.receiptFileKey,
        inVentas: !!i.documentId,
      }
    })
    .sort((a, b) => b.days - a.days)

  const paid = invoiceRows
    .filter((i) => i.status === "paid")
    // Latest payments first, not latest invoices.
    .sort((a, b) => (b.paidOn ?? b.issuedOn).localeCompare(a.paidOn ?? a.issuedOn))
    .slice(0, 15)
    .map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      tenantName: i.tenantName,
      periodLabel: periodLabel(i.period, asInterval(i.months)),
      number: i.number,
      amount: Number(i.amount),
      currency: i.currency,
      paidOn: i.paidOn,
      issuer: issuerName(i.tenantId, i.issuedOn, !!i.documentId),
      hasReceiptFile: !!i.receiptFileKey,
    }))

  const sumPen = (rows: { amount: number; currency: "PEN" | "USD" }[]) =>
    round2(rows.reduce((a, r) => a + toPenNow(r.amount, r.currency), 0))
  const collectedThisMonth = invoiceRows.filter(
    (i) => i.status === "paid" && (i.paidOn ?? "").slice(0, 7) === month,
  )

  return {
    today,
    totals: {
      receivable: sumPen(pending),
      receivableCount: pending.length,
      over30: sumPen(pending.filter((p) => p.bucket === "mas_30")),
      toIssueCount: toIssue.filter((t) => t.status === "pendiente" || t.status === "vencida")
        .length,
      collectedThisMonth: sumPen(
        collectedThisMonth.map((i) => ({ amount: Number(i.amount), currency: i.currency })),
      ),
    },
    toIssue,
    pending,
    paid,
    /** Merchants for the "Registrar factura" dialog. */
    // Cancelled merchants stay: one may still owe an invoice listed in "Por emitir".
    merchants: billingRows
      .map((b) => {
        const own = !b.issuerOverride || b.issuerOverride === fiscal?.issuer.id
        return {
          tenantId: b.tenantId,
          name: b.name,
          amount: b.monthlyAmount === null ? null : Number(b.monthlyAmount),
          currency: b.currency,
          months: asInterval(b.interval),
          includesIgv: b.includesIgv,
          issuer: issuerName(b.tenantId, today),
          /** Its invoices from `fiscalFromMonth` on are CUIK sales: the number must read F001-123. */
          ownIssuer: own,
          cancelled: b.status === "cancelled",
          ruc: b.ruc,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    igvRate: fiscal?.igvRate ?? null,
    /** First month CUIK E.I.R.L. issues (invoices dated earlier are Making Brands'). */
    fiscalFromMonth: fiscal ? (fiscal.issuer.fromMonth ?? "0000-00") : null,
  }
}

export type Collections = Awaited<ReturnType<typeof loadCollections>>
