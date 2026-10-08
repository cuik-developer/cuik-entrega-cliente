import { db, sql, tenantBilling, tenantInvoices, tenants } from "@cuik/db"
import { type BillingOutlook, billingOutlook, todayYmd } from "./billing"

/**
 * Billing outlook for many tenants at once (tenant list column, manager
 * summary block, reminder cron). Two queries regardless of the tenant count.
 */

export type TenantBillingOutlook = BillingOutlook & {
  monthlyAmount: number | null
  currency: "PEN" | "USD"
  serviceStartOn: string | null
}

export async function billingOutlookFor(
  tenantIds: string[],
  today = todayYmd(),
): Promise<Map<string, TenantBillingOutlook>> {
  const out = new Map<string, TenantBillingOutlook>()
  if (tenantIds.length === 0) return out
  const idList = sql.join(
    tenantIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const [configs, invoiced] = await Promise.all([
    db
      .select({
        tenantId: tenantBilling.tenantId,
        serviceStartOn: tenantBilling.serviceStartOn,
        billingDay: tenantBilling.billingDay,
        monthlyAmount: tenantBilling.monthlyAmount,
        currency: tenantBilling.currency,
      })
      .from(tenantBilling)
      .where(sql`${tenantBilling.tenantId} IN (${idList})`),
    db
      .select({ tenantId: tenantInvoices.tenantId, period: tenantInvoices.period })
      .from(tenantInvoices)
      .where(sql`${tenantInvoices.tenantId} IN (${idList}) AND ${tenantInvoices.status} <> 'void'`),
  ])
  const periods = new Map<string, string[]>()
  for (const r of invoiced) periods.set(r.tenantId, [...(periods.get(r.tenantId) ?? []), r.period])
  for (const c of configs) {
    out.set(c.tenantId, {
      ...billingOutlook(
        { serviceStartOn: c.serviceStartOn, billingDay: c.billingDay },
        periods.get(c.tenantId) ?? [],
        today,
      ),
      monthlyAmount: c.monthlyAmount === null ? null : Number(c.monthlyAmount),
      currency: c.currency,
      serviceStartOn: c.serviceStartOn,
    })
  }
  return out
}

export type BillingDueRow = {
  tenantId: string
  tenantName: string
  tenantSlug: string
  outlook: TenantBillingOutlook
}

/**
 * Tenants with a configured service start, with their outlook, for the
 * manager summary and the reminder email. Paused/cancelled tenants are
 * skipped: nothing to bill there.
 */
export async function billingDueRows(today = todayYmd()): Promise<BillingDueRow[]> {
  const rows = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .innerJoin(tenantBilling, sql`${tenantBilling.tenantId} = ${tenants.id}`)
    .where(
      sql`${tenantBilling.serviceStartOn} IS NOT NULL AND ${tenants.status} IN ('active', 'trial', 'expired')`,
    )
  const outlooks = await billingOutlookFor(
    rows.map((r) => r.id),
    today,
  )
  return rows
    .map((r) => {
      const outlook = outlooks.get(r.id)
      return outlook ? { tenantId: r.id, tenantName: r.name, tenantSlug: r.slug, outlook } : null
    })
    .filter((r): r is BillingDueRow => r !== null)
}

export type BillingSummary = {
  /** Due within the next 7 days (including today). */
  dueSoon: BillingDueRow[]
  /** Due date passed without an invoice (pendiente + vencida). */
  overdue: BillingDueRow[]
}

export function summarize(rows: BillingDueRow[]): BillingSummary {
  const dueSoon = rows
    .filter(
      (r) =>
        r.outlook.status !== "pendiente" &&
        r.outlook.status !== "vencida" &&
        r.outlook.daysUntilNext !== null &&
        r.outlook.daysUntilNext <= 7,
    )
    .sort((a, b) => (a.outlook.daysUntilNext ?? 0) - (b.outlook.daysUntilNext ?? 0))
  const overdue = rows
    .filter((r) => r.outlook.status === "pendiente" || r.outlook.status === "vencida")
    .sort((a, b) => (b.outlook.daysOverdue ?? 0) - (a.outlook.daysOverdue ?? 0))
  return { dueSoon, overdue }
}
