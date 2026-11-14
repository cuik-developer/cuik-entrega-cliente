import { and, db, eq, lte, tenantInvoices, tenants } from "@cuik/db"
import type { AdminAlert } from "./admin-alerts-types"
import { collectBillingAlerts } from "./admin-digest"
import { daysBetween, formatYmd, shiftMonth, todayYmd } from "./billing"
import { loadCollections } from "./collections-data"
import { invoicesWithoutSale } from "./documents-data"
import { getInternalTenantIds } from "./internal-tenants"
import { monthShort } from "./issuers"
import { pdtDueDate } from "./sunat-calendar"
import { loadFiscalRun } from "./tax-data"

/** Days before the PDT due date the agenda starts reminding. */
export const PDT_HEADS_UP_DAYS = 7
/** An unpaid invoice older than this is flagged. */
export const RECEIVABLE_LATE_DAYS = 30

const soles = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "vence en 3 días (22/12/2026)", "vence hoy", "venció hace 2 días". */
function dueText(days: number, due: string): string {
  if (days < 0) return `venció hace ${plural(-days, "día", "días")} (${formatYmd(due)})`
  if (days === 0) return `vence hoy (${formatYmd(due)})`
  return `vence en ${plural(days, "día", "días")} (${formatYmd(due)})`
}

type FiscalRun = Awaited<ReturnType<typeof loadFiscalRun>>

/** PDT due dates and reserves of the past months with a regime. */
function periodAlerts(run: FiscalRun, today: string, month: string, base: string): AdminAlert[] {
  if (!run.profile) return []
  const out: AdminAlert[] = []
  const ruc = run.issuer.ruc
  for (const r of run.allRows) {
    if (r.month >= month) continue
    const period = run.periods.get(r.month)
    const closed = period?.status === "closed"
    const due = period?.dueDate ?? pdtDueDate(r.month, ruc)
    if (!closed && due) {
      const days = daysBetween(today, due)
      if (days <= PDT_HEADS_UP_DAYS) {
        out.push({
          key: `finance:pdt:${r.month}`,
          kind: "finance",
          severity: days <= 2 ? "critical" : "warning",
          who: "Cuik",
          text: `PDT 621 de ${monthShort(r.month)} (${soles(r.payToSunat)}) ${dueText(days, due)}. Cuando el contador declare, importa su cierre y cierra el mes.`,
          href: `${base}/admin/finanzas/cierres?month=${r.month}`,
          days,
        })
      }
    }
    if (r.annualReserve > 0 && !period?.reserveMovedOn) {
      out.push({
        key: `finance:reserve:${r.month}`,
        kind: "finance",
        severity: "warning",
        who: "Cuik",
        text: `Separar ${soles(r.annualReserve)} de reserva para la renta anual (${monthShort(r.month)}) y marcarlo en Cierres.`,
        href: `${base}/admin/finanzas/cierres?month=${r.month}`,
      })
    }
  }
  return out
}

/**
 * Finance part of the admin agenda (daily digest, strip, home and Finanzas):
 * the PDT 621 of each month still open (due date from Cierres or the SUNAT
 * schedule), the accountant's close not imported, the 10 % reserve not set
 * aside, invoices unpaid for more than 30 days and Facturación invoices that
 * are not in Ventas. Merchant invoices to issue stay as "billing" alerts.
 */
export async function collectFinanceAlerts(base: string, now = new Date()): Promise<AdminAlert[]> {
  const today = todayYmd(now)
  const month = today.slice(0, 7)
  const out: AdminAlert[] = []
  const run = await loadFiscalRun(month)

  if (run.profile) {
    out.push(...periodAlerts(run, today, month, base))

    // Facturación invoices of this month and the previous one that are not sales yet.
    for (const m of [shiftMonth(month, -1), month]) {
      const missing = await invoicesWithoutSale(m)
      if (missing.length === 0) continue
      out.push({
        key: `finance:nosale:${m}`,
        kind: "finance",
        severity: "warning",
        who: "Cuik",
        text: `${plural(missing.length, "factura", "facturas")} de ${monthShort(m)} sin venta en Ventas: no cuentan en el IGV.`,
        href: `${base}/admin/finanzas/ventas?month=${m}`,
      })
    }
  }

  // Unpaid for more than 30 days.
  const limit = new Date(`${today}T12:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() - RECEIVABLE_LATE_DAYS)
  const late = await db
    .select({
      id: tenantInvoices.id,
      tenantName: tenants.name,
      number: tenantInvoices.number,
      issuedOn: tenantInvoices.issuedOn,
      amount: tenantInvoices.amount,
      currency: tenantInvoices.currency,
    })
    .from(tenantInvoices)
    .innerJoin(tenants, eq(tenants.id, tenantInvoices.tenantId))
    .where(
      and(
        eq(tenantInvoices.status, "pending"),
        lte(tenantInvoices.issuedOn, limit.toISOString().slice(0, 10)),
      ),
    )
  for (const i of late) {
    const days = daysBetween(i.issuedOn, today)
    out.push({
      key: `finance:late:${i.id}`,
      kind: "finance",
      severity: "warning",
      who: i.tenantName,
      text: `Factura ${i.number ?? "sin número"} (${i.currency === "USD" ? "US$" : "S/"} ${Number(i.amount).toFixed(2)}) sin cobrar hace ${days} días.`,
      href: `${base}/admin/finanzas/cobranza`,
      days: -days,
    })
  }
  return out
}

/** The PDT reminders repeat every day while due; the rest once a week. */
export function financeAlertIsDaily(key: string): boolean {
  return key.startsWith("finance:pdt:")
}

/**
 * Finanzas › Inicio: the month at a glance and the agenda (merchant invoices
 * to issue plus the finance alerts), most urgent first.
 */
export async function loadFinanceHome(now = new Date()) {
  const today = todayYmd(now)
  const month = today.slice(0, 7)
  const internal = new Set(await getInternalTenantIds())
  const [billing, finance, collections, run] = await Promise.all([
    collectBillingAlerts("", today, internal),
    collectFinanceAlerts("", now),
    loadCollections(),
    loadFiscalRun(month),
  ])
  const order = { critical: 0, warning: 1, info: 2 }
  const alerts = [...billing, ...finance].sort(
    (a, b) => order[a.severity] - order[b.severity] || (a.days ?? 0) - (b.days ?? 0),
  )

  // The next PDT to pay: the oldest past month still open.
  let nextPdt: { month: string; amount: number; due: string | null } | null = null
  let reservePending = 0
  if (run.profile) {
    for (const r of run.allRows) {
      if (r.month >= month) continue
      const p = run.periods.get(r.month)
      if (!nextPdt && p?.status !== "closed") {
        nextPdt = {
          month: r.month,
          amount: r.payToSunat,
          due: p?.dueDate ?? pdtDueDate(r.month, run.issuer.ruc),
        }
      }
      if (!p?.reserveMovedOn) reservePending += r.annualReserve
    }
  }
  return {
    today,
    alerts,
    stats: {
      receivable: collections.totals.receivable,
      receivableCount: collections.totals.receivableCount,
      collectedThisMonth: collections.totals.collectedThisMonth,
      toIssue: collections.totals.toIssueCount,
      nextPdt,
      reservePending: Math.round(reservePending * 100) / 100,
    },
  }
}

export type FinanceHome = Awaited<ReturnType<typeof loadFinanceHome>>
