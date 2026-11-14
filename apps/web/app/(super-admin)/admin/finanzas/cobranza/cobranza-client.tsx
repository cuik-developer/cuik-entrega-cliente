"use client"

import { Check, Loader2, Pencil, Plus } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import type { AgeBucket, Collections } from "@/lib/admin/collections-data"
import { apiCall, money, soles, todayLima, ymd } from "@/lib/admin/format"
import { InvoiceDialog, InvoiceFile, type InvoicePrefill } from "../_components/invoice-dialog"

const BUCKET: Record<AgeBucket, { label: string; tone: "ok" | "warn" | "bad" }> = {
  al_dia: { label: "Hasta 7 días", tone: "ok" },
  mas_7: { label: "Más de 7 días", tone: "warn" },
  mas_30: { label: "Más de 30 días", tone: "bad" },
}

type Prefill = InvoicePrefill
type Editing = { tenantId: string; invoiceId: string }

/**
 * Finanzas › Cobranza: bill every merchant from one screen. What is due to
 * be issued (each merchant's billing rule), what is issued and unpaid by age,
 * and what was collected lately. Registering here is the same as in the
 * merchant's Facturación tab (and from CUIK E.I.R.L. on, it lands in Ventas);
 * each invoice is also edited, voided or deleted here.
 */
export function CobranzaClient() {
  const [data, setData] = useState<Collections | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Prefill | "blank" | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)

  const loaded = useRef(false)
  const refresh = useCallback(async () => {
    try {
      setData(await apiCall<Collections>("GET", "/api/admin/finance/collections"))
      loaded.current = true
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de conexión"
      // Once loaded, a failed refresh keeps the tables on screen.
      if (loaded.current) toast.error(msg)
      else setError(msg)
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const header = (
    <PageHeader
      crumbs={[
        { label: "Inicio", href: "/admin" },
        { label: "Finanzas", href: "/admin/finanzas/tablero" },
        { label: "Cobranza" },
      ]}
      title="Cobranza"
      subtitle="Facturas por emitir, por cobrar y cobradas de todos los comercios."
      actions={
        <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => setDialog("blank")}>
          <Plus className="w-3.5 h-3.5" /> Registrar factura
        </Button>
      }
    />
  )
  if (error || !data) {
    return (
      <div className="space-y-3">
        {header}
        <PanelMessage className="py-20">
          {error ?? <Loader2 className="w-5 h-5 animate-spin" />}
        </PanelMessage>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {header}
      <StatStrip
        stats={[
          {
            label: "Por cobrar",
            value: soles(data.totals.receivable),
            hint: `${data.totals.receivableCount} ${data.totals.receivableCount === 1 ? "factura" : "facturas"}`,
          },
          {
            label: "Más de 30 días",
            value: soles(data.totals.over30),
            tone: data.totals.over30 > 0 ? "bad" : "mute",
          },
          {
            label: "Por emitir",
            value: data.totals.toIssueCount,
            hint: data.totals.toIssueCount > 0 ? "vencidas o de hoy" : "al día",
            tone: data.totals.toIssueCount > 0 ? "warn" : "ok",
          },
          { label: "Cobrado este mes", value: soles(data.totals.collectedThisMonth), tone: "ok" },
        ]}
      />
      <ToIssuePanel data={data} onRegister={(p) => setDialog(p)} />
      <PendingPanel data={data} onChanged={refresh} onEdit={setEditing} />
      <PaidPanel data={data} onEdit={setEditing} />
      {editing && (
        <InvoiceDialog
          ctx={data}
          edit={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
      {dialog && (
        <InvoiceDialog
          ctx={data}
          prefill={dialog === "blank" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function ToIssuePanel({
  data,
  onRegister,
}: {
  data: Collections
  onRegister: (p: Prefill) => void
}) {
  return (
    <Panel>
      <PanelHeader title="Por emitir" />
      {data.toIssue.length === 0 ? (
        <PanelMessage className="py-8">Nada por emitir en los próximos 7 días.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Comercio</Th>
              <Th>Periodo</Th>
              <Th>Fecha de facturación</Th>
              <Th align="right">Monto</Th>
              <Th>Estado</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {data.toIssue.map((t) => (
              <Tr key={`${t.tenantId}-${t.period}`}>
                <Td>
                  <Link
                    href={`/admin/tenants/${t.tenantId}`}
                    className="hover:underline font-medium"
                  >
                    {t.tenantName}
                  </Link>
                </Td>
                <Td>{t.periodLabel ?? "—"}</Td>
                <Td>{ymd(t.due)}</Td>
                <Td align="right">{t.amount === null ? "—" : money(t.amount, t.currency)}</Td>
                <Td>
                  {t.status === "vencida" ? (
                    <StatusChip tone="bad">Vencida hace {t.daysOverdue} días</StatusChip>
                  ) : t.status === "pendiente" ? (
                    <StatusChip tone="warn">
                      {t.daysOverdue ? `Venció hace ${t.daysOverdue} días` : "Por emitir hoy"}
                    </StatusChip>
                  ) : (
                    <StatusChip tone="info">
                      {t.daysUntil === 0 ? "Hoy" : `En ${t.daysUntil} días`}
                    </StatusChip>
                  )}
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[12px] gap-1.5"
                    onClick={() =>
                      onRegister({
                        tenantId: t.tenantId,
                        period: t.period,
                        months: t.months,
                        amount: t.amount,
                      })
                    }
                  >
                    <Plus className="w-3.5 h-3.5" /> Registrar
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

/** Pencil that opens an invoice in the shared dialog (edit, void, delete). */
function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title="Editar, anular o eliminar"
      onClick={onClick}
    >
      <Pencil className="w-3.5 h-3.5" />
    </Button>
  )
}

function PendingPanel({
  data,
  onChanged,
  onEdit,
}: {
  data: Collections
  onChanged: () => void
  onEdit: (e: Editing) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  async function markPaid(id: string, tenantId: string) {
    setBusy(id)
    try {
      // Paid today (not on the issue date): it counts in this month's collections.
      await apiCall("PATCH", `/api/admin/tenants/${tenantId}/billing/invoices/${id}`, {
        status: "paid",
        paidOn: todayLima(),
      })
      toast.success("Factura marcada como pagada")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(null)
    }
  }
  return (
    <Panel>
      <PanelHeader title="Por cobrar" />
      {data.pending.length === 0 ? (
        <PanelMessage className="py-8">No hay facturas pendientes de pago.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Comercio</Th>
              <Th>Factura</Th>
              <Th>Emitida</Th>
              <Th align="right">Monto</Th>
              <Th>Antigüedad</Th>
              <Th>Archivos</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {data.pending.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <Link
                    href={`/admin/tenants/${p.tenantId}`}
                    className="hover:underline font-medium"
                  >
                    {p.tenantName}
                  </Link>
                  <span className="block text-[11px] text-ent-fg-3">{p.periodLabel}</span>
                </Td>
                <Td>
                  {p.number ?? "—"}
                  {p.issuer && <span className="block text-[11px] text-ent-fg-3">{p.issuer}</span>}
                </Td>
                <Td>{ymd(p.issuedOn)}</Td>
                <Td align="right">{money(p.amount, p.currency)}</Td>
                <Td>
                  <StatusChip tone={BUCKET[p.bucket].tone}>
                    {p.days === 0 ? "Hoy" : `${p.days} días`}
                  </StatusChip>
                </Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <InvoiceFile
                      tenantId={p.tenantId}
                      invoiceId={p.id}
                      kind="invoice"
                      has={p.hasInvoiceFile}
                      onChanged={onChanged}
                    />
                    <InvoiceFile
                      tenantId={p.tenantId}
                      invoiceId={p.id}
                      kind="receipt"
                      has={p.hasReceiptFile}
                      onChanged={onChanged}
                    />
                  </div>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[12px] gap-1.5"
                    disabled={busy === p.id}
                    onClick={() => markPaid(p.id, p.tenantId)}
                  >
                    {busy === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Pagada
                  </Button>
                  <EditButton onClick={() => onEdit({ tenantId: p.tenantId, invoiceId: p.id })} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

function PaidPanel({ data, onEdit }: { data: Collections; onEdit: (e: Editing) => void }) {
  if (data.paid.length === 0) return null
  return (
    <Panel>
      <PanelHeader title="Cobradas recientemente" />
      <DataTable>
        <thead>
          <tr>
            <Th>Comercio</Th>
            <Th>Factura</Th>
            <Th>Periodo</Th>
            <Th align="right">Monto</Th>
            <Th>Pagada el</Th>
            <Th align="right"> </Th>
          </tr>
        </thead>
        <tbody>
          {data.paid.map((p) => (
            <Tr key={p.id}>
              <Td>
                <Link href={`/admin/tenants/${p.tenantId}`} className="hover:underline">
                  {p.tenantName}
                </Link>
              </Td>
              <Td>
                {p.number ?? "—"}
                {p.issuer && <span className="block text-[11px] text-ent-fg-3">{p.issuer}</span>}
              </Td>
              <Td>{p.periodLabel}</Td>
              <Td align="right">{money(p.amount, p.currency)}</Td>
              <Td>{ymd(p.paidOn)}</Td>
              <Td align="right">
                <EditButton onClick={() => onEdit({ tenantId: p.tenantId, invoiceId: p.id })} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  )
}
