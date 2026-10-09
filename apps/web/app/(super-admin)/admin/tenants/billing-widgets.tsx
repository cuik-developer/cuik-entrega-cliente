"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Notice, StatusChip } from "@/components/admin/enterprise"
import { BILLING_STATUS_LABEL, type BillingStatus, formatYmd } from "@/lib/admin/billing"
import type { ApiTenant } from "./tenant-shared"

const TONE: Record<BillingStatus, "ok" | "info" | "warn" | "bad" | "mute"> = {
  sin_configurar: "mute",
  sin_iniciar: "info",
  al_dia: "ok",
  pendiente: "warn",
  vencida: "bad",
}

/** "16 oct 2026 · en 8 días" with the status dot, for the tenant list. */
export function BillingCell({
  billing,
  tenantId,
}: {
  billing: NonNullable<ApiTenant["billing"]> | null
  tenantId: string
}) {
  const href = `/admin/tenants/${tenantId}?tab=facturacion`
  if (!billing || billing.status === "sin_configurar") {
    return (
      <Link href={href} className="text-[12px] text-ent-fg-3 hover:text-ent-accent hover:underline">
        Sin configurar
      </Link>
    )
  }
  const overdue = billing.status === "pendiente" || billing.status === "vencida"
  const text = overdue
    ? billing.daysOverdue
      ? `${billing.status === "vencida" ? "Vencida" : "Pendiente"} · ${billing.daysOverdue} ${billing.daysOverdue === 1 ? "día" : "días"}`
      : "Vence hoy"
    : billing.nextDue
      ? billing.daysUntilNext === 0
        ? `${formatYmd(billing.nextDue)} · hoy`
        : `${formatYmd(billing.nextDue)} · en ${billing.daysUntilNext} ${billing.daysUntilNext === 1 ? "día" : "días"}`
      : BILLING_STATUS_LABEL[billing.status]
  // 3 days or less reads as a heads-up even when still "al día".
  const tone =
    !overdue && billing.daysUntilNext !== null && billing.daysUntilNext <= 3
      ? "warn"
      : TONE[billing.status]
  return (
    <Link href={href} className="hover:underline">
      <StatusChip
        tone={tone}
        title={`${BILLING_STATUS_LABEL[billing.status]}${billing.monthsOfService !== null ? ` · mes ${billing.monthsOfService + 1} de servicio` : ""}`}
      >
        {text}
      </StatusChip>
    </Link>
  )
}

export type SummaryRow = {
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

export type BillingSummaryData = { dueSoon: SummaryRow[]; overdue: SummaryRow[] }

/** Invoices to issue this week and overdue ones, for the manager page. */
export function useBillingSummary(): BillingSummaryData | null {
  const [data, setData] = useState<BillingSummaryData | null>(null)
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
  return data
}

export function money(amount: number | null, currency: "PEN" | "USD") {
  if (amount === null) return ""
  return `${currency === "USD" ? "US$" : "S/"} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`
}

function names(rows: SummaryRow[], max = 3) {
  const shown = rows.slice(0, max)
  const rest = rows.length - shown.length
  return (
    <>
      {shown.map((r, i) => (
        <span key={r.tenantId}>
          {i > 0 && ", "}
          <Link
            href={`/admin/tenants/${r.tenantId}?tab=facturacion`}
            className="font-semibold text-ent-fg hover:underline"
          >
            {r.tenantName}
          </Link>
        </span>
      ))}
      {rest > 0 && ` y ${rest} más`}
    </>
  )
}

/** One line per situation, above the tenant table. Renders nothing when all is in order. */
export function BillingNotices({ data }: { data: BillingSummaryData | null }) {
  if (!data || (data.dueSoon.length === 0 && data.overdue.length === 0)) return null
  return (
    <div className="space-y-2">
      {data.overdue.length > 0 && (
        <Notice tone="bad">
          {data.overdue.length === 1 ? (
            <>
              {names(data.overdue)} no tiene factura registrada para el periodo{" "}
              {data.overdue[0].currentPeriod ?? "actual"}
              {data.overdue[0].daysOverdue
                ? ` (hace ${data.overdue[0].daysOverdue} ${data.overdue[0].daysOverdue === 1 ? "día" : "días"}`
                : " (vence hoy"}
              {data.overdue[0].monthlyAmount !== null
                ? `, ${money(data.overdue[0].monthlyAmount, data.overdue[0].currency)})`
                : ")"}
              .
            </>
          ) : (
            <>
              {data.overdue.length} tenants sin factura registrada: {names(data.overdue)}.
            </>
          )}
        </Notice>
      )}
      {data.dueSoon.length > 0 && (
        <Notice tone="warn">
          {data.dueSoon.length === 1 ? (
            <>
              {names(data.dueSoon)} factura{" "}
              {data.dueSoon[0].daysUntilNext === 0
                ? "hoy"
                : data.dueSoon[0].daysUntilNext === 1
                  ? "mañana"
                  : `en ${data.dueSoon[0].daysUntilNext} días`}
              {data.dueSoon[0].nextDue ? ` (${formatYmd(data.dueSoon[0].nextDue)}` : " ("}
              {data.dueSoon[0].monthlyAmount !== null
                ? `, ${money(data.dueSoon[0].monthlyAmount, data.dueSoon[0].currency)})`
                : ")"}
              .
            </>
          ) : (
            <>
              {data.dueSoon.length} facturas por emitir en los próximos 7 días:{" "}
              {names(data.dueSoon)}.
            </>
          )}
        </Notice>
      )}
    </div>
  )
}
