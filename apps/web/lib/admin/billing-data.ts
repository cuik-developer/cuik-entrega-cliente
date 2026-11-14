import { and, db, desc, eq, sql, taxProfiles, tenantBilling, tenantInvoices } from "@cuik/db"
import { asInterval, billingOutlook, periodLabel, shiftMonth, todayYmd } from "./billing"
import { currentMonthLima, loadIssuers } from "./company-data"
import { issuerForMonth, profileForMonth } from "./issuers"

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

/**
 * Billing config + calendar outlook + invoice history of one tenant, with the
 * issuer of each invoice (by the month it was issued: Making Brands until
 * Oct 2026, CUIK E.I.R.L. after) and the issuer and IGV rate in force today.
 */
export async function loadBilling(tenantId: string) {
  const [issuerRows, profileRows] = await Promise.all([
    loadIssuers(),
    db
      .select({
        issuerId: taxProfiles.issuerId,
        fromMonth: taxProfiles.fromMonth,
        igvRate: taxProfiles.igvRate,
      })
      .from(taxProfiles),
  ])
  const month = currentMonthLima()
  const currentIssuer = issuerForMonth(issuerRows, month)
  const currentProfile = currentIssuer
    ? profileForMonth(profileRows, currentIssuer.id, month)
    : null
  const [config] = await db
    .select()
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, tenantId))
    .limit(1)
  // A merchant whose contract is with another razón social (Dfrios with Making
  // Brands) is always invoiced by it, whatever the month.
  const override = config?.issuerId
    ? (issuerRows.find((i) => i.id === config.issuerId) ?? null)
    : null
  const issuerNow = override ?? currentIssuer
  const issuerOf = (ymd: string) => {
    // Making Brands months keep their issuer even if the override is Cuik itself.
    const byMonth = issuerForMonth(issuerRows, ymd.slice(0, 7))
    const i = override && override.id !== currentIssuer?.id ? override : byMonth
    return i ? { razonSocial: i.razonSocial, ruc: i.ruc, current: i.id === issuerNow?.id } : null
  }
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
          amountIncludesIgv: config.amountIncludesIgv,
          issuerId: config.issuerId,
          isRetentionAgent: config.isRetentionAgent,
          notes: config.notes,
          updatedAt: config.updatedAt.toISOString(),
        }
      : null,
    outlook,
    issuer: issuerNow ? { razonSocial: issuerNow.razonSocial, ruc: issuerNow.ruc } : null,
    /** Razones sociales that can invoice, for the "Factura a través de" select. */
    issuers: issuerRows.map((i) => ({ id: i.id, razonSocial: i.razonSocial, ruc: i.ruc })),
    /** IGV rate of the regime in force today; null until a tax profile exists or when another issuer invoices it. */
    igvRate:
      currentProfile && (!override || override.id === currentIssuer?.id)
        ? Number(currentProfile.igvRate)
        : null,
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
      issuer: issuerOf(i.issuedOn),
      /** Sale document in Finanzas › Ventas (from CUIK E.I.R.L. on). */
      documentId: i.documentId,
      createdAt: i.createdAt.toISOString(),
    })),
  }
}
