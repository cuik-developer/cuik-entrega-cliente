import { db, desc, eq, tenantBilling, tenantInvoices } from "@cuik/db"
import { billingOutlook, todayYmd } from "./billing"

/** Billing config + calendar outlook + invoice history of one tenant. */
export async function loadBilling(tenantId: string) {
  const [config] = await db
    .select()
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, tenantId))
    .limit(1)
  const invoices = await db
    .select()
    .from(tenantInvoices)
    .where(eq(tenantInvoices.tenantId, tenantId))
    .orderBy(desc(tenantInvoices.issuedOn), desc(tenantInvoices.createdAt))
    .limit(120)
  const invoicedPeriods = invoices.filter((i) => i.status !== "void").map((i) => i.period)
  const outlook = billingOutlook(
    { serviceStartOn: config?.serviceStartOn ?? null, billingDay: config?.billingDay ?? null },
    invoicedPeriods,
    todayYmd(),
  )
  return {
    config: config
      ? {
          ruc: config.ruc,
          razonSocial: config.razonSocial,
          direccionFiscal: config.direccionFiscal,
          billingEmail: config.billingEmail,
          contactoPagos: config.contactoPagos,
          monthlyAmount: config.monthlyAmount === null ? null : Number(config.monthlyAmount),
          currency: config.currency,
          serviceStartOn: config.serviceStartOn,
          billingDay: config.billingDay,
          notes: config.notes,
          updatedAt: config.updatedAt.toISOString(),
        }
      : null,
    outlook,
    invoices: invoices.map((i) => ({
      id: i.id,
      period: i.period,
      issuedOn: i.issuedOn,
      number: i.number,
      amount: Number(i.amount),
      currency: i.currency,
      status: i.status,
      paidOn: i.paidOn,
      note: i.note,
      invoiceFile: i.invoiceFileKey ? { name: i.invoiceFileName ?? "factura" } : null,
      receiptFile: i.receiptFileKey ? { name: i.receiptFileName ?? "voucher" } : null,
      createdAt: i.createdAt.toISOString(),
    })),
  }
}
