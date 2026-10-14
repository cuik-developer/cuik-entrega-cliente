import { and, db, desc, eq, sql, tenantBilling, tenantInvoices } from "@cuik/db"
import { asInterval, billingOutlook, periodLabel, shiftMonth, todayYmd } from "./billing"

/**
 * Serialises invoice writes of one tenant inside the current transaction, so
 * two concurrent registrations cannot both pass the overlap check.
 */
export async function lockTenantInvoices(tx: Pick<typeof db, "execute">, tenantId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`)
}

/**
 * The live invoice whose covered months intersect [period, period + months),
 * if any (excluding `excludeId`, for edits). Returns a Spanish message ready
 * for a 409, or null.
 */
export async function findCoverageClash(
  tx: Pick<typeof db, "select">,
  tenantId: string,
  period: string,
  months: number,
  excludeId?: string,
): Promise<string | null> {
  const live = await tx
    .select({ id: tenantInvoices.id, period: tenantInvoices.period, months: tenantInvoices.months })
    .from(tenantInvoices)
    .where(and(eq(tenantInvoices.tenantId, tenantId), sql`${tenantInvoices.status} <> 'void'`))
  const newEnd = shiftMonth(period, months)
  const clash = live.find(
    (l) => l.id !== excludeId && l.period < newEnd && shiftMonth(l.period, l.months) > period,
  )
  if (!clash) return null
  return `Ese periodo se cruza con la factura de ${periodLabel(clash.period, asInterval(clash.months))}`
}

/**
 * True when a failed insert/update hit the "one live invoice per period"
 * index. Drizzle wraps the PG error (message = "Failed query: ..."), so the
 * constraint name is only on `cause`.
 */
export function isPeriodConflict(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; constraint?: string } } | null)?.cause
  return cause?.code === "23505" && cause.constraint === "tenant_invoices_tenant_period_uidx"
}

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
  const invoicedPeriods = invoices
    .filter((i) => i.status !== "void")
    .map((i) => ({ period: i.period, months: i.months }))
  const outlook = billingOutlook(
    {
      serviceStartOn: config?.serviceStartOn ?? null,
      billingDay: config?.billingDay ?? null,
      billingMode: config?.billingMode ?? "arrears",
      intervalMonths: asInterval(config?.billingIntervalMonths),
    },
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
          billingMode: config.billingMode,
          billingIntervalMonths: asInterval(config.billingIntervalMonths),
          notes: config.notes,
          updatedAt: config.updatedAt.toISOString(),
        }
      : null,
    outlook,
    invoices: invoices.map((i) => ({
      id: i.id,
      period: i.period,
      months: asInterval(i.months),
      recognition: i.recognition,
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
