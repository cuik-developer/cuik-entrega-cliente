"use client"

import { AlertTriangle, CalendarClock, Receipt } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { BILLING_STATUS_LABEL, type BillingStatus, formatYmd } from "@/lib/admin/billing"
import type { ApiTenant } from "./tenant-shared"

const DOT: Record<BillingStatus, string> = {
  sin_configurar: "bg-slate-300",
  sin_iniciar: "bg-blue-400",
  al_dia: "bg-emerald-500",
  pendiente: "bg-amber-500",
  vencida: "bg-red-500",
}

/** "16 oct · faltan 8 días" + status dot, for the tenant list. */
export function BillingCell({
  billing,
  tenantId,
}: {
  billing: NonNullable<ApiTenant["billing"]> | null
  tenantId: string
}) {
  if (!billing || billing.status === "sin_configurar") {
    return (
      <Link
        href={`/admin/tenants/${tenantId}?tab=facturacion`}
        className="text-xs text-slate-400 hover:text-[#0e70db] hover:underline"
      >
        Sin configurar
      </Link>
    )
  }
  const overdue = billing.status === "pendiente" || billing.status === "vencida"
  const text = overdue
    ? billing.daysOverdue
      ? `Sin factura hace ${billing.daysOverdue} ${billing.daysOverdue === 1 ? "día" : "días"}`
      : "Factura para emitir hoy"
    : billing.nextDue
      ? billing.daysUntilNext === 0
        ? `${formatYmd(billing.nextDue)} · hoy`
        : `${formatYmd(billing.nextDue)} · ${billing.daysUntilNext === 1 ? "falta 1 día" : `faltan ${billing.daysUntilNext} días`}`
      : BILLING_STATUS_LABEL[billing.status]
  return (
    <Link
      href={`/admin/tenants/${tenantId}?tab=facturacion`}
      className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-[#0e70db]"
      title={`${BILLING_STATUS_LABEL[billing.status]}${billing.monthsOfService !== null ? ` · mes ${billing.monthsOfService + 1} de servicio` : ""}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[billing.status]}`} aria-hidden="true" />
      <span className={overdue ? "text-red-700 font-medium" : ""}>{text}</span>
    </Link>
  )
}

type SummaryRow = {
  tenantId: string
  tenantName: string
  status: BillingStatus
  nextDue: string | null
  daysUntilNext: number | null
  currentPeriod: string | null
  daysOverdue: number | null
  monthlyAmount: number | null
  currency: "PEN" | "USD"
}

function money(amount: number | null, currency: "PEN" | "USD") {
  if (amount === null) return ""
  return ` · ${currency === "USD" ? "US$" : "S/"} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`
}

/** Header strip above the tenant list: invoices to issue this week and overdue ones. */
export function BillingSummaryBar() {
  const [data, setData] = useState<{ dueSoon: SummaryRow[]; overdue: SummaryRow[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/billing/summary")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setData(json.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!data || (data.dueSoon.length === 0 && data.overdue.length === 0)) return null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Receipt className="w-4 h-4 text-[#0e70db]" /> Facturación
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.overdue.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Sin factura registrada (
              {data.overdue.length})
            </div>
            <ul className="space-y-1">
              {data.overdue.map((r) => (
                <li key={r.tenantId} className="text-xs text-slate-700">
                  <Link
                    href={`/admin/tenants/${r.tenantId}?tab=facturacion`}
                    className="font-medium hover:underline"
                  >
                    {r.tenantName}
                  </Link>
                  {` · periodo ${r.currentPeriod ?? "—"}`}
                  {r.daysOverdue
                    ? ` · hace ${r.daysOverdue} ${r.daysOverdue === 1 ? "día" : "días"}`
                    : " · vence hoy"}
                  {money(r.monthlyAmount, r.currency)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.dueSoon.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Para emitir en los próximos 7 días (
              {data.dueSoon.length})
            </div>
            <ul className="space-y-1">
              {data.dueSoon.map((r) => (
                <li key={r.tenantId} className="text-xs text-slate-700">
                  <Link
                    href={`/admin/tenants/${r.tenantId}?tab=facturacion`}
                    className="font-medium hover:underline"
                  >
                    {r.tenantName}
                  </Link>
                  {r.nextDue ? ` · ${formatYmd(r.nextDue)}` : ""}
                  {r.daysUntilNext === 0
                    ? " · hoy"
                    : r.daysUntilNext === 1
                      ? " · mañana"
                      : ` · en ${r.daysUntilNext} días`}
                  {money(r.monthlyAmount, r.currency)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
