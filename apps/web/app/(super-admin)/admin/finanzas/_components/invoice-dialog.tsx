"use client"

import { FileText, Loader2, Trash2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Notice } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { loadBilling } from "@/lib/admin/billing-data"
import type { Collections } from "@/lib/admin/collections-data"
import { apiCall, apiUpload, money, todayLima } from "@/lib/admin/format"
import { splitIgv } from "@/lib/admin/issuers"

const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"

/**
 * A "Por emitir" row the dialog opens from (merchant, period and amount
 * already chosen), or the month Ventas is showing (`issuedOn` in it).
 */
export type InvoicePrefill = {
  tenantId: string
  period: string | null
  months: number
  amount: number | null
  issuedOn?: string
}

/** What the dialog needs from Cobranza: the merchants and the fiscal rules. */
export type InvoiceContext = Pick<Collections, "merchants" | "igvRate" | "fiscalFromMonth">

type Billing = Awaited<ReturnType<typeof loadBilling>>
type Invoice = Billing["invoices"][number]
type Status = "pending" | "paid" | "void"
type Recognition = "spread" | "cash"
type Merchant = InvoiceContext["merchants"][number]

/** "Por adelantado, mensual" — the merchant's billing rule in words. */
function ruleText(m: Merchant): string {
  const mode = m.billingMode === "advance" ? "por adelantado" : "a periodo vencido"
  return `${mode}, ${m.months === 1 ? "mensual" : `cada ${m.months} meses`}`
}

type Form = {
  tenantId: string
  period: string
  months: number
  recognition: Recognition
  issuedOn: string
  number: string
  amount: string
  status: Status
  paidOn: string
  note: string
}

/** Starting values: the invoice being edited, else the "Por emitir" row, else the merchant's terms. */
function initialForm(
  invoice: Invoice | null,
  tenantId: string,
  prefill: InvoicePrefill | null,
  ctx: InvoiceContext,
): Form {
  const today = todayLima()
  if (invoice) {
    return {
      tenantId,
      period: invoice.period,
      months: invoice.months,
      recognition: invoice.recognition,
      issuedOn: invoice.issuedOn,
      number: invoice.number ?? "",
      amount: String(invoice.amount),
      status: invoice.status,
      paidOn: invoice.paidOn ?? today,
      note: invoice.note ?? "",
    }
  }
  const terms = ctx.merchants.find((m) => m.tenantId === prefill?.tenantId)
  const amount = prefill?.amount ?? terms?.amount ?? null
  return {
    tenantId: prefill?.tenantId ?? "",
    // The "Por emitir" row's period, else the merchant's rule, else the month it opened in.
    period: prefill?.period ?? terms?.nextPeriod ?? (prefill?.issuedOn ?? today).slice(0, 7),
    months: prefill?.months || terms?.months || 1,
    recognition: "spread",
    issuedOn: prefill?.issuedOn ?? today,
    number: "",
    amount: amount === null ? "" : String(amount),
    status: "pending",
    paidOn: today,
    note: "",
  }
}

/** The merchants (unless given) and, when editing, the invoice from its merchant's billing. */
async function loadDialog(
  givenCtx: InvoiceContext | undefined,
  edit: { tenantId: string; invoiceId: string } | null,
): Promise<{ ctx: InvoiceContext; invoice: Invoice | null }> {
  const [ctx, billing] = await Promise.all([
    givenCtx ?? apiCall<Collections>("GET", "/api/admin/finance/collections"),
    edit ? apiCall<Billing>("GET", `/api/admin/tenants/${edit.tenantId}/billing`) : null,
  ])
  const invoice = edit ? (billing?.invoices.find((i) => i.id === edit.invoiceId) ?? null) : null
  return { ctx, invoice }
}

/**
 * The PATCH of an edit: only what changed, as Facturación does — a resent
 * amount or number would count as a change of the books (refused in a
 * closed month, and the sale's base/IGV split recomputed).
 */
function editPatch(invoice: Invoice, f: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (f.period !== invoice.period) out.period = f.period
  if (f.months !== invoice.months) out.months = f.months
  if (f.recognition !== invoice.recognition) out.recognition = f.recognition
  if (f.issuedOn !== invoice.issuedOn) out.issuedOn = f.issuedOn
  if (f.number.trim() !== (invoice.number ?? "")) out.number = f.number
  if (Number(f.amount) !== invoice.amount) out.amount = Number(f.amount)
  if (f.status !== invoice.status) out.status = f.status
  // The paid date is kept when voiding or reopening (Facturación does the same).
  if (f.status === "paid" && f.paidOn !== invoice.paidOn) out.paidOn = f.paidOn
  if (f.note.trim() !== (invoice.note ?? "")) out.note = f.note
  return out
}

/**
 * Register or edit a merchant invoice from Finanzas (Cobranza, Ventas): the
 * same record as the merchant's Facturación tab, so it is entered once. From
 * CUIK E.I.R.L. on it is also the sale in Ventas, kept in step by the server.
 * Without `ctx` it loads the merchants itself; with `edit` it loads that
 * invoice and also offers void, delete and its files.
 */
export function InvoiceDialog({
  ctx: givenCtx,
  prefill = null,
  edit = null,
  onClose,
  onSaved,
}: {
  ctx?: InvoiceContext
  prefill?: InvoicePrefill | null
  edit?: { tenantId: string; invoiceId: string } | null
  onClose: () => void
  onSaved: () => void
}) {
  const [ctx, setCtx] = useState<InvoiceContext | null>(givenCtx ?? null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A file attached in the dialog changes the list behind: refresh it however it closes.
  const [filesChanged, setFilesChanged] = useState(false)
  const close = filesChanged ? onSaved : onClose

  useEffect(() => {
    let live = true
    loadDialog(givenCtx, edit)
      .then((r) => {
        if (!live) return
        setCtx(r.ctx)
        setInvoice(r.invoice)
        if (edit && !r.invoice) setError("No se encontró la factura")
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Error de conexión"))
    return () => {
      live = false
    }
  }, [givenCtx, edit])

  const ready = ctx && (!edit || invoice)
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {edit ? `Factura ${invoice?.number ?? ""}`.trim() : "Registrar factura"}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-[12.5px] text-ent-fg-2">{error}</p>
        ) : ready ? (
          <InvoiceForm
            ctx={ctx}
            invoice={invoice}
            tenantId={edit?.tenantId ?? null}
            prefill={prefill}
            onClose={close}
            onSaved={onSaved}
            onFilesChanged={() => setFilesChanged(true)}
          />
        ) : (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-ent-fg-3" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Under "Periodo que cubre": what the merchant's billing rule proposes. */
function PeriodHint({ merchant, period }: { merchant: Merchant; period: string }) {
  const text =
    merchant.nextPeriod === null
      ? "Sin inicio de servicio en su Facturación: elige el periodo."
      : period === merchant.nextPeriod
        ? `Según su regla: ${ruleText(merchant)}.`
        : `Su regla propone ${merchant.nextPeriod} (${ruleText(merchant)}).`
  return <p className="text-[11px] text-ent-fg-3">{text}</p>
}

function InvoiceForm({
  ctx,
  invoice,
  tenantId,
  prefill,
  onClose,
  onSaved,
  onFilesChanged,
}: {
  ctx: InvoiceContext
  invoice: Invoice | null
  tenantId: string | null
  prefill: InvoicePrefill | null
  onClose: () => void
  onSaved: () => void
  onFilesChanged: () => void
}) {
  const editing = !!invoice
  const [f, setF] = useState<Form>(() => initialForm(invoice, tenantId ?? "", prefill, ctx))
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const merchant = ctx.merchants.find((m) => m.tenantId === f.tenantId) ?? null
  const currency = invoice?.currency ?? merchant?.currency ?? "PEN"
  // A CUIK sale when the merchant is billed by CUIK and the invoice is dated from its first month on.
  const needsSerie =
    !!invoice?.documentId ||
    (!!merchant?.ownIssuer &&
      ctx.fiscalFromMonth !== null &&
      f.issuedOn.slice(0, 7) >= ctx.fiscalFromMonth)

  function pick(id: string) {
    const m = ctx.merchants.find((x) => x.tenantId === id)
    // Another merchant: its own terms and the period its billing rule invoices next.
    setF((p) => ({
      ...p,
      tenantId: id,
      period: m?.nextPeriod ?? (prefill?.issuedOn ?? todayLima()).slice(0, 7),
      months: m?.months ?? 1,
      amount: m?.amount != null ? String(m.amount) : "",
    }))
  }

  const base = `/api/admin/tenants/${f.tenantId}/billing/invoices`
  async function save() {
    if (!merchant && !editing) return
    setBusy(true)
    try {
      if (invoice) {
        const patch = editPatch(invoice, f)
        if (Object.keys(patch).length === 0) {
          onClose()
          return
        }
        await apiCall("PATCH", `${base}/${invoice.id}`, patch)
      } else {
        await apiCall("POST", base, {
          period: f.period,
          months: f.months,
          issuedOn: f.issuedOn,
          number: f.number,
          amount: Number(f.amount),
          status: f.status,
          paidOn: f.status === "paid" ? f.paidOn : null,
          note: f.note,
          recognition: f.recognition,
          currency,
        })
      }
      toast.success(
        invoice
          ? "Factura actualizada"
          : needsSerie
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

  async function remove() {
    if (!invoice) return
    const sale = invoice.documentId ? " y su venta en Finanzas › Ventas" : ""
    if (
      !confirm(
        `¿Eliminar la factura ${invoice.number ?? ""}${sale}? Se borran sus archivos. No se puede deshacer. Si se emitió en SUNAT, mejor anúlala.`,
      )
    )
      return
    setBusy(true)
    try {
      await apiCall("DELETE", `${base}/${invoice.id}`)
      toast.success("Factura eliminada")
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    } finally {
      setBusy(false)
    }
  }

  const amount = Number(f.amount)
  const split =
    merchant && ctx.igvRate !== null && needsSerie && amount > 0
      ? splitIgv(amount, merchant.includesIgv, ctx.igvRate)
      : null
  const numberOk = !needsSerie || /^[A-Za-z0-9]{1,4}\s*-\s*\d{1,10}$/.test(f.number.trim())
  const valid =
    !!f.tenantId &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(f.period) &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.issuedOn) &&
    f.amount !== "" &&
    amount >= 0 &&
    numberOk

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
        <div className="space-y-1 col-span-2 sm:col-span-3">
          <Label className="text-xs">Comercio</Label>
          <select
            className={sel}
            value={f.tenantId}
            disabled={editing}
            onChange={(e) => pick(e.target.value)}
          >
            <option value="">Elige un comercio…</option>
            {ctx.merchants.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
                {m.ruc ? ` · ${m.ruc}` : ""}
                {m.cancelled ? " (cancelado)" : ""}
              </option>
            ))}
          </select>
          {(invoice?.issuer?.razonSocial ?? merchant?.issuer) && (
            <p className="text-[11px] text-ent-fg-3">
              Emisor: {invoice?.issuer?.razonSocial ?? merchant?.issuer}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Periodo que cubre</Label>
          <Input type="month" value={f.period} onChange={(e) => set("period", e.target.value)} />
          {merchant && !editing && <PeriodHint merchant={merchant} period={f.period} />}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Meses</Label>
          <select
            className={sel}
            value={String(f.months)}
            onChange={(e) => set("months", Number(e.target.value))}
          >
            {[1, 3, 6, 12].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 mes" : `${n} meses`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">En finanzas cuenta</Label>
          <select
            className={sel}
            value={f.recognition}
            onChange={(e) => set("recognition", e.target.value as Recognition)}
          >
            <option value="spread">Repartido mes a mes</option>
            <option value="cash">Todo en el mes del cobro</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fecha de emisión</Label>
          <Input type="date" value={f.issuedOn} onChange={(e) => set("issuedOn", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número</Label>
          <Input
            value={f.number}
            placeholder="F001-123"
            onChange={(e) => set("number", e.target.value.toUpperCase())}
          />
          {needsSerie && <p className="text-[11px] text-ent-fg-3">Serie-número, como en SUNAT.</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Monto ({currency})</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={f.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
          {split && (
            <p className="text-[11px] text-ent-fg-3">
              Base {money(split.base, currency)} + IGV {money(split.igv, currency)}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Estado</Label>
          <select
            className={sel}
            value={f.status}
            onChange={(e) => set("status", e.target.value as Status)}
          >
            <option value="pending">Pendiente de pago</option>
            <option value="paid">Pagada</option>
            {editing && <option value="void">Anulada</option>}
          </select>
        </div>
        {f.status === "paid" && (
          <div className="space-y-1">
            <Label className="text-xs">Pagada el</Label>
            <Input type="date" value={f.paidOn} onChange={(e) => set("paidOn", e.target.value)} />
          </div>
        )}
        <div className="space-y-1 col-span-2 sm:col-span-3">
          <Label className="text-xs">Nota</Label>
          <Input value={f.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>
      {merchant && !merchant.ownIssuer && merchant.issuer && !invoice?.documentId && (
        <Notice tone="info">
          Este comercio factura por {merchant.issuer}: queda en su cobranza, no en las ventas de
          Cuik.
        </Notice>
      )}
      {f.status === "void" && invoice?.status !== "void" && (
        <Notice tone="warn">
          Anulada deja de contar en la cobranza{invoice?.documentId ? " y en el IGV del mes" : ""}.
        </Notice>
      )}
      {invoice ? (
        <div className="flex flex-wrap gap-4">
          <InvoiceFile
            tenantId={f.tenantId}
            invoiceId={invoice.id}
            kind="invoice"
            has={!!invoice.invoiceFile}
            onChanged={onFilesChanged}
          />
          <InvoiceFile
            tenantId={f.tenantId}
            invoiceId={invoice.id}
            kind="receipt"
            has={!!invoice.receiptFile}
            onChanged={onFilesChanged}
          />
        </div>
      ) : (
        <p className="text-[11.5px] text-ent-fg-3">
          El PDF y el voucher se adjuntan desde la lista, una vez registrada.
        </p>
      )}
      <div className="flex items-center gap-2">
        {invoice && (
          <Button
            size="sm"
            variant="ghost"
            className="text-ent-bad gap-1.5"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" disabled={busy || !valid} onClick={save}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar factura"}
        </Button>
      </div>
    </>
  )
}

/** The issued invoice (PDF) or the payment voucher of a merchant invoice. */
export function InvoiceFile({
  tenantId,
  invoiceId,
  kind,
  has: initiallyHas,
  onChanged,
}: {
  tenantId: string
  invoiceId: string
  kind: "invoice" | "receipt"
  has: boolean
  onChanged?: () => void
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const has = initiallyHas || uploaded
  const label = kind === "invoice" ? "Factura" : "Voucher"
  const base = `/api/admin/tenants/${tenantId}/billing/invoices/${invoiceId}/files`
  async function upload(file: File) {
    setBusy(true)
    try {
      await apiUpload(base, file, { kind })
      toast.success(`${label} adjuntado`)
      setUploaded(true)
      onChanged?.()
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
          const file = e.target.files?.[0]
          if (file) upload(file)
        }}
      />
    </span>
  )
}
