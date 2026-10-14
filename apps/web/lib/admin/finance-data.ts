import {
  asc,
  db,
  desc,
  eq,
  financeEntries,
  fxRates,
  loans,
  recurringItems,
  tenantInvoices,
  tenants,
} from "@cuik/db"
import { asInterval } from "./billing"
import type { EntryLike, FxRates, InvoiceLike, LoanLike, RecurringLike } from "./finance"

/** Everything the finance screens and the ledger need, as plain numbers. */
export async function loadFinance() {
  const [rates, recurring, entries, loanRows] = await Promise.all([
    db.select().from(fxRates).orderBy(desc(fxRates.month)),
    db.select().from(recurringItems).orderBy(asc(recurringItems.type), asc(recurringItems.name)),
    db
      .select({
        id: financeEntries.id,
        type: financeEntries.type,
        category: financeEntries.category,
        name: financeEntries.name,
        amount: financeEntries.amount,
        currency: financeEntries.currency,
        month: financeEntries.month,
        months: financeEntries.months,
        recognition: financeEntries.recognition,
        tenantId: financeEntries.tenantId,
        tenantName: tenants.name,
        notes: financeEntries.notes,
        createdAt: financeEntries.createdAt,
      })
      .from(financeEntries)
      .leftJoin(tenants, eq(tenants.id, financeEntries.tenantId))
      .orderBy(desc(financeEntries.month), desc(financeEntries.createdAt)),
    db.select().from(loans).orderBy(asc(loans.firstMonth)),
  ])
  return {
    rates: rates.map((r) => ({
      month: r.month,
      usdPen: Number(r.usdPen),
      updatedAt: r.updatedAt.toISOString(),
    })),
    recurring: recurring.map((r) => ({
      id: r.id,
      type: r.type,
      category: r.category,
      name: r.name,
      amount: Number(r.amount),
      currency: r.currency,
      everyMonths: r.everyMonths,
      fromMonth: r.fromMonth,
      toMonth: r.toMonth,
      recognition: r.recognition,
      notes: r.notes,
      active: r.active,
    })),
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      category: e.category,
      name: e.name,
      amount: Number(e.amount),
      currency: e.currency,
      month: e.month,
      months: e.months,
      recognition: e.recognition,
      tenantId: e.tenantId,
      tenantName: e.tenantName,
      notes: e.notes,
    })),
    loans: loanRows.map((l) => ({
      id: l.id,
      name: l.name,
      principal: Number(l.principal),
      currency: l.currency,
      installment: Number(l.installment),
      installments: l.installments,
      firstMonth: l.firstMonth,
      notes: l.notes,
    })),
  }
}

export type FinanceData = Awaited<ReturnType<typeof loadFinance>>

/** Inputs for `buildLedger` from the stored rows plus every live merchant invoice. */
export async function loadLedgerInputs(): Promise<{
  rates: FxRates
  recurring: RecurringLike[]
  entries: EntryLike[]
  loans: LoanLike[]
  invoices: InvoiceLike[]
}> {
  const data = await loadFinance()
  const invoiceRows = await db
    .select({
      period: tenantInvoices.period,
      months: tenantInvoices.months,
      amount: tenantInvoices.amount,
      currency: tenantInvoices.currency,
      recognition: tenantInvoices.recognition,
      status: tenantInvoices.status,
      paidOn: tenantInvoices.paidOn,
      issuedOn: tenantInvoices.issuedOn,
    })
    .from(tenantInvoices)
  const rates: FxRates = {}
  for (const r of data.rates) rates[r.month] = r.usdPen
  return {
    rates,
    recurring: data.recurring,
    entries: data.entries,
    loans: data.loans,
    invoices: invoiceRows.map((i) => ({
      period: i.period,
      months: asInterval(i.months),
      amount: Number(i.amount),
      currency: i.currency,
      recognition: i.recognition,
      status: i.status,
      paidOn: i.paidOn,
      issuedOn: i.issuedOn,
    })),
  }
}
