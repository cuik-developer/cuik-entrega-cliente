"use client"

import {
  CalendarClock,
  Check,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Receipt,
  Save,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  BILLING_STATUS_LABEL,
  type BillingOutlook,
  type BillingStatus,
  formatYmd,
} from "@/lib/admin/billing"

type Config = {
  ruc: string | null
  razonSocial: string | null
  direccionFiscal: string | null
  billingEmail: string | null
  contactoPagos: string | null
  monthlyAmount: number | null
  currency: "PEN" | "USD"
  serviceStartOn: string | null
  billingDay: number | null
  notes: string | null
  updatedAt: string
}
type Invoice = {
  id: string
  period: string
  issuedOn: string
  number: string | null
  amount: number
  currency: "PEN" | "USD"
  status: "pending" | "paid" | "void"
  paidOn: string | null
  note: string | null
  invoiceFile: { name: string } | null
  receiptFile: { name: string } | null
}
type Data = { config: Config | null; outlook: BillingOutlook; invoices: Invoice[] }

const STATUS_CLASS: Record<BillingStatus, string> = {
  sin_configurar: "bg-slate-100 text-slate-600 border-slate-200",
  sin_iniciar: "bg-blue-100 text-blue-700 border-blue-200",
  al_dia: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pendiente: "bg-amber-100 text-amber-700 border-amber-200",
  vencida: "bg-red-100 text-red-700 border-red-200",
}
const INVOICE_STATUS: Record<Invoice["status"], { label: string; className: string }> = {
  pending: {
    label: "Pendiente de pago",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  paid: { label: "Pagada", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  void: { label: "Anulada", className: "bg-slate-100 text-slate-500 border-slate-200" },
}
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

function money(amount: number | null, currency: "PEN" | "USD") {
  if (amount === null) return "—"
  return `${currency === "USD" ? "US$" : "S/"} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function firstFieldError(json: { details?: { fieldErrors?: Record<string, string[]> } }) {
  const fe = json.details?.fieldErrors
  if (!fe) return null
  return Object.values(fe)[0]?.[0] ?? null
}

type FormState = {
  ruc: string
  razonSocial: string
  direccionFiscal: string
  billingEmail: string
  contactoPagos: string
  monthlyAmount: string
  currency: "PEN" | "USD"
  serviceStartOn: string
  billingDay: string
  notes: string
}

function formFrom(c: Config | null): FormState {
  return {
    ruc: c?.ruc ?? "",
    razonSocial: c?.razonSocial ?? "",
    direccionFiscal: c?.direccionFiscal ?? "",
    billingEmail: c?.billingEmail ?? "",
    contactoPagos: c?.contactoPagos ?? "",
    monthlyAmount:
      c?.monthlyAmount === null || c?.monthlyAmount === undefined ? "" : String(c.monthlyAmount),
    currency: c?.currency ?? "PEN",
    serviceStartOn: c?.serviceStartOn ?? "",
    billingDay: c?.billingDay ? String(c.billingDay) : "",
    notes: c?.notes ?? "",
  }
}

function outlookTitle(o: BillingOutlook): string {
  if (!o.nextDue) return "Indica el inicio de servicios para ver la próxima factura"
  if (o.daysUntilNext === 0) return "Factura para emitir hoy"
  const days = o.daysUntilNext === 1 ? "falta 1 día" : `faltan ${o.daysUntilNext} días`
  return `Próxima factura: ${formatYmd(o.nextDue)} · ${days}`
}

function serviceLine(config: Config | null, o: BillingOutlook): string | null {
  if (!config?.serviceStartOn) return null
  if (o.status === "sin_iniciar")
    return `El servicio inicia el ${formatYmd(config.serviceStartOn)}.`
  const n = (o.monthsOfService ?? 0) + 1
  return `Trabajando juntos desde el ${formatYmd(config.serviceStartOn)} · mes ${n} de servicio.`
}

/** One upload control (invoice PDF or payment voucher) for an invoice row. */
function FileSlot({
  invoiceId,
  kind,
  current,
  tenantId,
  busy,
  onUploaded,
  onBusy,
}: {
  invoiceId: string
  kind: "invoice" | "receipt"
  current: { name: string } | null
  tenantId: string
  busy: boolean
  onUploaded: (data: Data) => void
  onBusy: (b: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const label = kind === "invoice" ? "Factura" : "Voucher"
  const href = `/api/admin/tenants/${tenantId}/billing/invoices/${invoiceId}/files/${kind}`

  async function upload(file: File) {
    onBusy(true)
    try {
      const fd = new FormData()
      fd.set("kind", kind)
      fd.set("file", file)
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/billing/invoices/${invoiceId}/files`,
        {
          method: "POST",
          body: fd,
        },
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "No se pudo subir el archivo")
        return
      }
      onUploaded(json.data)
      toast.success(`${label} adjuntado`)
    } catch {
      toast.error("Error de conexión")
    } finally {
      onBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      {current ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#0e70db] hover:underline"
          title={current.name}
        >
          <FileText className="w-3.5 h-3.5" /> {label}
        </a>
      ) : (
        <span className="text-xs text-slate-400">{label}: —</span>
      )}
      <button
        type="button"
        className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
        title={
          current
            ? `Reemplazar ${label.toLowerCase()}`
            : `Subir ${label.toLowerCase()} (PDF, JPG o PNG)`
        }
        aria-label={`Subir ${label.toLowerCase()}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
      </button>
      <input
        ref={inputRef}
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

/**
 * "Facturación" section of the tenant page: fiscal data, service start and
 * monthly fee (one form), the calendar outlook, and the invoice log with the
 * issued invoice and payment voucher attached. Invoices are issued outside
 * Cuik; here they are only recorded.
 */
export function TenantBillingSection({
  tenantId,
  tenantName,
}: {
  tenantId: string
  tenantName: string
}) {
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState<FormState>(formFrom(null))
  const [saving, setSaving] = useState(false)
  const [busyInvoice, setBusyInvoice] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [inv, setInv] = useState({
    period: "",
    issuedOn: "",
    number: "",
    amount: "",
    status: "pending" as Invoice["status"],
    note: "",
  })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/billing`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setData(json.data)
      setForm(formFrom(json.data.config))
    } catch {
      toast.error("No se pudo cargar la facturación")
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/billing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyAmount: form.monthlyAmount === "" ? null : Number(form.monthlyAmount),
          billingDay: form.billingDay === "" ? null : Number(form.billingDay),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(firstFieldError(json) ?? json.error ?? "No se pudo guardar")
        return
      }
      setData(json.data)
      setForm(formFrom(json.data.config))
      toast.success("Facturación guardada")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setSaving(false)
    }
  }

  function openNewInvoice() {
    const o = data?.outlook
    const period =
      o?.currentPeriod ?? o?.nextDue?.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
    const amount = data?.config?.monthlyAmount
    setInv({
      period,
      issuedOn: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      number: "",
      amount: amount === null || amount === undefined ? "" : String(amount),
      status: "pending",
      note: "",
    })
    setShowNew(true)
  }

  async function createInvoice() {
    setCreating(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inv,
          amount: Number(inv.amount),
          currency: data?.config?.currency ?? "PEN",
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(firstFieldError(json) ?? json.error ?? "No se pudo registrar la factura")
        return
      }
      setData(json.data)
      setShowNew(false)
      toast.success("Factura registrada")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setCreating(false)
    }
  }

  async function patchInvoice(id: string, body: Record<string, unknown>, ok: string) {
    setBusyInvoice(id)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/billing/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "No se pudo actualizar")
        return
      }
      setData(json.data)
      toast.success(ok)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusyInvoice(null)
    }
  }

  async function deleteInvoice(id: string) {
    if (!confirm("¿Eliminar este registro de factura? No afecta a la factura emitida.")) return
    setBusyInvoice(id)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/billing/invoices/${id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "No se pudo eliminar")
        return
      }
      setData(json.data)
      toast.success("Registro eliminado")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusyInvoice(null)
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  const o = data.outlook
  const currency = data.config?.currency ?? "PEN"
  const service = serviceLine(data.config, o)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Outlook */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-[#0e70db]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{outlookTitle(o)}</span>
            <Badge className={`text-[11px] border ${STATUS_CLASS[o.status]}`}>
              {BILLING_STATUS_LABEL[o.status]}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {o.status === "pendiente" || o.status === "vencida"
              ? `El periodo ${o.currentPeriod} venció el ${formatYmd(o.currentDue ?? "")} y no tiene factura registrada${o.daysOverdue ? ` (hace ${o.daysOverdue} días)` : ""}.`
              : data.config?.monthlyAmount !== null && data.config?.monthlyAmount !== undefined
                ? `Monto mensual acordado: ${money(data.config.monthlyAmount, currency)}.`
                : "Sin monto mensual definido."}
            {service ? ` ${service}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-[#0e70db] hover:bg-[#0c5fb8] text-white gap-1.5 shrink-0"
          onClick={openNewInvoice}
        >
          <Plus className="w-4 h-4" /> Registrar factura
        </Button>
      </div>

      {/* New invoice form */}
      {showNew && (
        <div className="rounded-xl border border-[#0e70db]/30 bg-[#0e70db]/5 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Registrar factura emitida a {tenantName}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Periodo (AAAA-MM)</Label>
              <Input
                value={inv.period}
                onChange={(e) => setInv({ ...inv, period: e.target.value })}
                placeholder="2026-10"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha de emisión</Label>
              <Input
                type="date"
                value={inv.issuedOn}
                onChange={(e) => setInv({ ...inv, issuedOn: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Número</Label>
              <Input
                value={inv.number}
                onChange={(e) => setInv({ ...inv, number: e.target.value })}
                placeholder="F001-000123"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monto ({currency})</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={inv.amount}
                onChange={(e) => setInv({ ...inv, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={inv.status}
                onChange={(e) => setInv({ ...inv, status: e.target.value as Invoice["status"] })}
              >
                <option value="pending">Pendiente de pago</option>
                <option value="paid">Pagada</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nota</Label>
              <Input
                value={inv.note}
                onChange={(e) => setInv({ ...inv, note: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <Paperclip className="w-3 h-3" /> La factura en PDF y el voucher se adjuntan desde la
            lista, una vez registrada.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[#0e70db] hover:bg-[#0c5fb8] text-white gap-1.5"
              disabled={creating || !inv.period || !inv.issuedOn || inv.amount === ""}
              onClick={createInvoice}
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar factura
            </Button>
          </div>
        </div>
      )}

      {/* Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Datos fiscales
          </h3>
          <div className="space-y-1">
            <Label className="text-xs">RUC</Label>
            <Input
              value={form.ruc}
              onChange={(e) => set("ruc", e.target.value)}
              placeholder="20123456789"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Razón social</Label>
            <Input value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dirección fiscal</Label>
            <Input
              value={form.direccionFiscal}
              onChange={(e) => set("direccionFiscal", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Correo para facturas</Label>
            <Input
              type="email"
              value={form.billingEmail}
              onChange={(e) => set("billingEmail", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contacto de pagos</Label>
            <Input
              value={form.contactoPagos}
              onChange={(e) => set("contactoPagos", e.target.value)}
              placeholder="Nombre y teléfono"
            />
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Servicio y cobro
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Inicio de servicios</Label>
              <Input
                type="date"
                value={form.serviceStartOn}
                onChange={(e) => set("serviceStartOn", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Día de facturación</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={form.billingDay}
                onChange={(e) => set("billingDay", e.target.value)}
              >
                <option value="">Mismo día del inicio</option>
                {DAYS.map((d) => (
                  <option key={d} value={String(d)}>
                    Todos los {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            La primera factura corresponde al día de inicio y las siguientes cada mes el mismo día
            (tope 28). Una factura cuenta como pendiente desde ese día y como vencida a los 7 días
            sin registrar.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Monto mensual</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.monthlyAmount}
                onChange={(e) => set("monthlyAmount", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Moneda</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={form.currency}
                onChange={(e) => set("currency", e.target.value as "PEN" | "USD")}
              >
                <option value="PEN">S/ soles</option>
                <option value="USD">US$ dólares</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas de facturación</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Condiciones, descuentos, forma de pago…"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          className="bg-[#0e70db] hover:bg-[#0c5fb8] text-white gap-2"
          disabled={saving}
          onClick={save}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar facturación
        </Button>
      </div>

      {/* Invoices */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Facturas registradas
        </h3>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no hay facturas registradas para este comercio.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-medium">Periodo</th>
                  <th className="py-2 pr-3 font-medium">Emitida</th>
                  <th className="py-2 pr-3 font-medium">Número</th>
                  <th className="py-2 pr-3 font-medium text-right">Monto</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Archivos</th>
                  <th className="py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => {
                  const st = INVOICE_STATUS[i.status]
                  const busy = busyInvoice === i.id
                  return (
                    <tr key={i.id} className="border-b border-slate-50 align-top">
                      <td className="py-2 pr-3 font-medium text-slate-900">{i.period}</td>
                      <td className="py-2 pr-3 text-slate-600">{formatYmd(i.issuedOn)}</td>
                      <td className="py-2 pr-3 text-slate-600">{i.number ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {money(i.amount, i.currency)}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge className={`text-[10px] border ${st.className}`}>{st.label}</Badge>
                        {i.status === "paid" && i.paidOn ? (
                          <span className="ml-1 text-[11px] text-slate-400">
                            {formatYmd(i.paidOn)}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-1">
                          <FileSlot
                            invoiceId={i.id}
                            kind="invoice"
                            current={i.invoiceFile}
                            tenantId={tenantId}
                            busy={busy}
                            onUploaded={setData}
                            onBusy={(b) => setBusyInvoice(b ? i.id : null)}
                          />
                          <FileSlot
                            invoiceId={i.id}
                            kind="receipt"
                            current={i.receiptFile}
                            tenantId={tenantId}
                            busy={busy}
                            onUploaded={setData}
                            onBusy={(b) => setBusyInvoice(b ? i.id : null)}
                          />
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {i.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              disabled={busy}
                              title="Marcar como pagada"
                              onClick={() =>
                                patchInvoice(
                                  i.id,
                                  { status: "paid" },
                                  "Factura marcada como pagada",
                                )
                              }
                            >
                              <Check className="w-3.5 h-3.5" /> Pagada
                            </Button>
                          )}
                          {i.status !== "void" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              disabled={busy}
                              title="Anular (libera el periodo)"
                              onClick={() =>
                                patchInvoice(i.id, { status: "void" }, "Factura anulada")
                              }
                            >
                              <Undo2 className="w-3.5 h-3.5" /> Anular
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-red-600"
                              disabled={busy}
                              title="Eliminar registro"
                              onClick={() => deleteInvoice(i.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
