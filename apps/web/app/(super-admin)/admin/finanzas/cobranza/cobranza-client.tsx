"use client"

import { Check, FileText, Loader2, Plus, Upload } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  Notice,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AgeBucket, Collections } from "@/lib/admin/collections-data"
import { apiCall, apiUpload, money, soles, todayLima, ymd } from "@/lib/admin/format"
import { splitIgv } from "@/lib/admin/issuers"

const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"
const BUCKET: Record<AgeBucket, { label: string; tone: "ok" | "warn" | "bad" }> = {
  al_dia: { label: "Hasta 7 días", tone: "ok" },
  mas_7: { label: "Más de 7 días", tone: "warn" },
  mas_30: { label: "Más de 30 días", tone: "bad" },
}

type Prefill = { tenantId: string; period: string | null; months: number; amount: number | null }

/**
 * Finanzas › Cobranza: bill every merchant from one screen. What is due to
 * be issued (each merchant's billing rule), what is issued and unpaid by age,
 * and what was collected lately. Registering here is the same as in the
 * merchant's Facturación tab (and from CUIK E.I.R.L. on, it lands in Ventas).
 */
export function CobranzaClient() {
  const [data, setData] = useState<Collections | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Prefill | "blank" | null>(null)

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
      <PendingPanel data={data} onChanged={refresh} />
      <PaidPanel data={data} />
      {dialog && (
        <RegisterDialog
          data={data}
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

function PendingPanel({ data, onChanged }: { data: Collections; onChanged: () => void }) {
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
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}

/** The issued invoice (PDF) or the payment voucher of a merchant invoice. */
function InvoiceFile({
  tenantId,
  invoiceId,
  kind,
  has,
  onChanged,
}: {
  tenantId: string
  invoiceId: string
  kind: "invoice" | "receipt"
  has: boolean
  onChanged: () => void
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const label = kind === "invoice" ? "Factura" : "Voucher"
  const base = `/api/admin/tenants/${tenantId}/billing/invoices/${invoiceId}/files`
  async function upload(file: File) {
    setBusy(true)
    try {
      await apiUpload(base, file, { kind })
      toast.success(`${label} adjuntado`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo")
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ""
    }
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px]">
      {has ? (
        <a
          href={`${base}/${kind}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ent-accent hover:underline"
        >
          <FileText className="w-3 h-3" /> {label}
        </a>
      ) : (
        <span className="text-ent-fg-3">{label}: —</span>
      )}
      <button
        type="button"
        className="text-ent-fg-3 hover:text-ent-fg-2 disabled:opacity-50"
        title={has ? `Reemplazar ${label.toLowerCase()}` : `Subir ${label.toLowerCase()}`}
        aria-label={`Subir ${label.toLowerCase()}`}
        disabled={busy}
        onClick={() => ref.current?.click()}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
        }}
      />
    </span>
  )
}

function PaidPanel({ data }: { data: Collections }) {
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
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  )
}

/* ───────────────────────── Registrar factura ───────────────────────── */

/** The dialog's starting values: the "Por emitir" row when it opened from one, else the merchant's terms. */
function initialForm(prefill: Prefill | null, data: Collections, today: string) {
  const terms = data.merchants.find((m) => m.tenantId === prefill?.tenantId)
  const amount = prefill?.amount ?? terms?.amount ?? null
  return {
    tenantId: prefill?.tenantId ?? "",
    period: prefill?.period ?? today.slice(0, 7),
    months: prefill?.months ?? terms?.months ?? 1,
    issuedOn: today,
    number: "",
    amount: amount === null ? "" : String(amount),
    status: "pending" as "pending" | "paid",
    paidOn: today,
    note: "",
  }
}

function RegisterDialog({
  data,
  prefill,
  onClose,
  onSaved,
}: {
  data: Collections
  prefill: Prefill | null
  onClose: () => void
  onSaved: () => void
}) {
  const today = todayLima()
  const [f, setF] = useState(() => initialForm(prefill, data, today))
  const [busy, setBusy] = useState(false)
  const merchant = data.merchants.find((m) => m.tenantId === f.tenantId) ?? null
  // A CUIK sale when the merchant is billed by CUIK and the invoice is dated from its first month on.
  const needsSerie =
    !!merchant?.ownIssuer &&
    data.fiscalFromMonth !== null &&
    f.issuedOn.slice(0, 7) >= data.fiscalFromMonth

  function pick(tenantId: string) {
    const m = data.merchants.find((x) => x.tenantId === tenantId)
    // Another merchant: its own terms, nothing carried from the previous one.
    setF((p) => ({
      ...p,
      tenantId,
      period: today.slice(0, 7),
      months: m?.months ?? 1,
      amount: m?.amount != null ? String(m.amount) : "",
    }))
  }

  async function save() {
    if (!merchant) return
    setBusy(true)
    try {
      await apiCall("POST", `/api/admin/tenants/${merchant.tenantId}/billing/invoices`, {
        period: f.period,
        months: f.months,
        recognition: "spread",
        issuedOn: f.issuedOn,
        number: f.number,
        amount: Number(f.amount),
        currency: merchant.currency,
        status: f.status,
        paidOn: f.status === "paid" ? f.paidOn : null,
        note: f.note,
      })
      toast.success(
        needsSerie
          ? "Factura registrada: también quedó en Finanzas › Ventas"
          : "Factura registrada",
      )
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  const amount = Number(f.amount)
  const split =
    merchant && data.igvRate !== null && needsSerie && amount > 0
      ? splitIgv(amount, merchant.includesIgv, data.igvRate)
      : null
  const numberOk = !needsSerie || /^[A-Za-z0-9]{1,4}\s*-\s*\d{1,10}$/.test(f.number.trim())
  const ready =
    !!merchant &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(f.period) &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.issuedOn) &&
    f.amount !== "" &&
    amount >= 0 &&
    numberOk

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Registrar factura</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
          <div className="space-y-1 col-span-2 sm:col-span-3">
            <Label className="text-xs">Comercio</Label>
            <select className={sel} value={f.tenantId} onChange={(e) => pick(e.target.value)}>
              <option value="">Elige un comercio…</option>
              {data.merchants.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.name}
                  {m.ruc ? ` · ${m.ruc}` : ""}
                  {m.cancelled ? " (cancelado)" : ""}
                </option>
              ))}
            </select>
            {merchant?.issuer && (
              <p className="text-[11px] text-ent-fg-3">Emisor: {merchant.issuer}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Periodo que cubre</Label>
            <Input
              type="month"
              value={f.period}
              onChange={(e) => setF({ ...f, period: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Meses</Label>
            <select
              className={sel}
              value={String(f.months)}
              onChange={(e) => setF({ ...f, months: Number(e.target.value) })}
            >
              {[1, 3, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 mes" : `${n} meses`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha de emisión</Label>
            <Input
              type="date"
              value={f.issuedOn}
              onChange={(e) => setF({ ...f, issuedOn: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Número</Label>
            <Input
              value={f.number}
              placeholder="F001-123"
              onChange={(e) => setF({ ...f, number: e.target.value.toUpperCase() })}
            />
            {needsSerie && (
              <p className="text-[11px] text-ent-fg-3">Serie-número, como en SUNAT.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monto ({merchant?.currency ?? "PEN"})</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
            {split && (
              <p className="text-[11px] text-ent-fg-3">
                Base {money(split.base, merchant?.currency ?? "PEN")} + IGV{" "}
                {money(split.igv, merchant?.currency ?? "PEN")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <select
              className={sel}
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value as "pending" | "paid" })}
            >
              <option value="pending">Pendiente de pago</option>
              <option value="paid">Pagada</option>
            </select>
          </div>
          {f.status === "paid" && (
            <div className="space-y-1">
              <Label className="text-xs">Pagada el</Label>
              <Input
                type="date"
                value={f.paidOn}
                onChange={(e) => setF({ ...f, paidOn: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1 col-span-2 sm:col-span-3">
            <Label className="text-xs">Nota</Label>
            <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
        </div>
        {merchant && !merchant.ownIssuer && merchant.issuer && (
          <Notice tone="info">
            Este comercio factura por {merchant.issuer}: queda en su cobranza, no en las ventas de
            Cuik.
          </Notice>
        )}
        <p className="text-[11.5px] text-ent-fg-3">
          El PDF y el voucher se adjuntan desde la lista, una vez registrada.
        </p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={busy || !ready} onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar factura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
