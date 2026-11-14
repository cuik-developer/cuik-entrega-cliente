"use client"

import { FINANCE_COST_CATEGORIES } from "@cuik/shared/validators"
import {
  Ban,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DOCUMENT_FILE_RULES, type DocumentFileKind } from "@/lib/admin/document-files"
import {
  DOC_TYPE_LABEL,
  DOC_TYPES_BY_DIRECTION,
  type DocType,
  docSign,
  IGV_TREATMENT_LABEL,
  type IgvTreatment,
  RENTA_LABEL,
  toPen,
} from "@/lib/admin/documents"
import type { DocumentsPage } from "@/lib/admin/documents-data"
import { apiCall as api, money, soles, todayLima, ymd } from "@/lib/admin/format"
import { monthShort, splitIgv } from "@/lib/admin/issuers"
import { parseUbl, type UblDocument, UblError } from "@/lib/admin/ubl"
import { InvoiceDialog, type InvoicePrefill } from "./invoice-dialog"
import { SuppliersPanel } from "./suppliers-panel"
import { uploadDocumentFile, XmlFill, type XmlFillState } from "./xml-fill"

type Direction = "sale" | "purchase"
type Doc = DocumentsPage["docs"][number]

const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const COPY: Record<
  Direction,
  { title: string; crumb: string; party: string; empty: string; igvLabel: string }
> = {
  sale: {
    title: "Ventas",
    crumb: "Ventas",
    party: "Cliente",
    empty: "No hay comprobantes emitidos en este periodo.",
    igvLabel: "IGV débito",
  },
  purchase: {
    title: "Compras",
    crumb: "Compras",
    party: "Proveedor",
    empty: "No hay comprobantes recibidos en este periodo.",
    igvLabel: "IGV",
  },
}

/**
 * Finanzas › Ventas / Compras: the fiscal documents of one tax period (like
 * Odoo's customer invoices and vendor bills) with their PDF, XML and CDR.
 * Merchant invoices are registered with "Factura a comercio" (the same record
 * as Cobranza and the merchant's Facturación tab) and edited from here too.
 */
export function DocumentsClient({ direction }: { direction: Direction }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7)
  const [month, setMonth] = useState(today)
  const [data, setData] = useState<DocumentsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Doc | "new" | null>(null)
  /** Merchant invoice dialog: a new one (optionally for a merchant) or one to edit. */
  const [invoiceDialog, setInvoiceDialog] = useState<InvoiceDialogState | null>(null)
  const copy = COPY[direction]

  // "?month=2026-11" (links from Facturación) opens that period.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month")
    if (m && MONTH_RE.test(m)) setMonth(m)
  }, [])

  // Only the latest request may paint: a slow answer for another month is dropped.
  const requestRef = useRef(0)
  const refresh = useCallback(async () => {
    const req = ++requestRef.current
    try {
      const page = await api<DocumentsPage>(
        "GET",
        `/api/admin/finance/documents?direction=${direction}&month=${month}`,
      )
      if (req !== requestRef.current) return
      setData(page)
      setError(null)
    } catch (e) {
      if (req !== requestRef.current) return
      setError(e instanceof Error ? e.message : "Error de conexión")
    }
  }, [direction, month])
  useEffect(() => {
    refresh()
  }, [refresh])

  async function setStatus(d: Doc, status: "registered" | "void") {
    if (status === "void" && !confirm(`¿Anular ${d.docTypeLabel.toLowerCase()} ${d.number}?`))
      return
    try {
      await api("PATCH", `/api/admin/finance/documents/${d.id}`, { status })
      toast.success(status === "void" ? "Comprobante anulado" : "Comprobante reactivado")
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    }
  }
  async function remove(d: Doc) {
    if (
      !confirm(
        `¿Eliminar ${d.docTypeLabel.toLowerCase()} ${d.number}? Se borran sus archivos${d.entryId ? " y el costo que creó en Costos e ingresos" : ""}. No se puede deshacer.`,
      )
    )
      return
    try {
      await api("DELETE", `/api/admin/finance/documents/${d.id}`)
      toast.success("Comprobante eliminado")
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  const header = (
    <PageHeader
      crumbs={[
        { label: "Inicio", href: "/admin" },
        { label: "Finanzas", href: "/admin/finanzas/tablero" },
        { label: copy.crumb },
      ]}
      title={copy.title}
      subtitle={
        data?.issuer
          ? direction === "sale"
            ? `Comprobantes emitidos por ${data.issuer.razonSocial} · RUC ${data.issuer.ruc}`
            : `Comprobantes recibidos a nombre de ${data.issuer.razonSocial} · RUC ${data.issuer.ruc}`
          : "Comprobantes del periodo"
      }
      actions={
        <>
          <Input
            type="month"
            value={month}
            onChange={(e) => MONTH_RE.test(e.target.value) && setMonth(e.target.value)}
            className="h-7 w-[180px] text-[12px]"
            aria-label="Periodo"
          />
          <Button asChild size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
            <a href={`/api/admin/finance/documents/export?direction=${direction}&month=${month}`}>
              <Download className="w-3.5 h-3.5" /> Exportar registro
            </a>
          </Button>
          {direction === "sale" && (
            <Button
              size="sm"
              className="h-7 text-[12px] gap-1.5"
              onClick={() => setInvoiceDialog({ tenantId: null })}
            >
              <Plus className="w-3.5 h-3.5" /> Factura a comercio
            </Button>
          )}
          <Button
            size="sm"
            variant={direction === "sale" ? "outline" : "default"}
            className="h-7 text-[12px] gap-1.5"
            onClick={() => setEditing("new")}
          >
            <Plus className="w-3.5 h-3.5" />{" "}
            {direction === "sale" ? "Otro comprobante" : "Registrar comprobante"}
          </Button>
        </>
      }
    />
  )

  if (error) {
    return (
      <div className="space-y-3">
        {header}
        <PanelMessage className="py-20">{error}</PanelMessage>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-3">
        {header}
        <PanelMessage className="py-20">
          <Loader2 className="w-5 h-5 animate-spin" />
        </PanelMessage>
      </div>
    )
  }

  const live = data.docs.filter((d) => d.status !== "void")
  const missingFile = live.filter((d) => !d.files.pdf && !d.invoice?.hasFile).length
  const credit = live
    .filter((d) => d.igvTreatment === "credito")
    .reduce((acc, d) => acc + docSign(d.docType) * toPen(d.igv, d.currency, d.fxRate), 0)

  const table = (
    <Panel>
      <PanelHeader title={`Comprobantes de ${monthShort(month)}`} />
      {data.docs.length === 0 ? (
        <PanelMessage className="py-10">{copy.empty}</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Comprobante</Th>
              <Th>{copy.party}</Th>
              <Th align="right">Base</Th>
              <Th align="right">IGV</Th>
              <Th align="right">Total</Th>
              <Th>{direction === "sale" ? "Cobranza" : "IGV"}</Th>
              <Th>Archivos</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {data.docs.map((d) => (
              <DocRow
                key={d.id}
                d={d}
                direction={direction}
                onEdit={() =>
                  d.invoice && d.tenantId
                    ? setInvoiceDialog({ edit: { tenantId: d.tenantId, invoiceId: d.invoice.id } })
                    : setEditing(d)
                }
                onStatus={(s) => setStatus(d, s)}
                onDelete={() => remove(d)}
                onChanged={refresh}
                closed={data.closed}
              />
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )

  const body = (
    <div className="space-y-3">
      {data.closed && (
        <Notice tone="info">
          {monthShort(month)} está cerrado: sus comprobantes son de solo lectura (puedes agregar
          archivos que falten). Para cambiarlos, reábrelo en Finanzas › Cierres.
        </Notice>
      )}
      {!data.issuer && (
        <Notice tone="warn">
          Ningún emisor cubre {monthShort(month)}. Revisa Finanzas › Empresa y régimen.
        </Notice>
      )}
      {direction === "sale" && (
        <Notice tone="info">
          Las facturas a comercios se registran con «Factura a comercio» (es la misma factura de
          Cobranza y de la pestaña Facturación del comercio) y se editan con el lápiz. «Otro
          comprobante» es para ventas a otros clientes y notas de crédito o débito.
        </Notice>
      )}
      <PendingInvoices invoices={data.pendingInvoices} onCreated={refresh} />
      {missingFile > 0 && (
        <Notice tone="warn">
          {missingFile === 1
            ? "1 comprobante no tiene PDF adjunto."
            : `${missingFile} comprobantes no tienen PDF adjunto.`}
        </Notice>
      )}
      <StatStrip
        stats={[
          { label: "Comprobantes", value: data.totals.count },
          { label: "Base gravada", value: soles(data.totals.baseGravada) },
          direction === "sale"
            ? { label: copy.igvLabel, value: soles(data.totals.igv) }
            : {
                label: "IGV con crédito",
                value: soles(Math.round(credit * 100) / 100),
                hint: `de ${soles(data.totals.igv)}`,
              },
          { label: "Total", value: soles(data.totals.total) },
        ]}
      />
      {table}
    </div>
  )

  return (
    <div className="space-y-3">
      {header}
      {direction === "purchase" ? (
        <Tabs defaultValue="docs">
          <TabsList className="h-8">
            <TabsTrigger value="docs" className="text-[12.5px]">
              Comprobantes
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="text-[12.5px]">
              Proveedores
            </TabsTrigger>
          </TabsList>
          <TabsContent value="docs">{body}</TabsContent>
          <TabsContent value="suppliers">
            <SuppliersPanel suppliers={data.suppliers} onChanged={refresh} />
          </TabsContent>
        </Tabs>
      ) : (
        body
      )}
      {editing && (
        <DocumentDialog
          direction={direction}
          data={data}
          doc={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(savedMonth) => {
            setEditing(null)
            if (savedMonth !== month) setMonth(savedMonth)
            else refresh()
          }}
          onSuppliersChanged={refresh}
          onMerchantInvoice={(tenantId) => {
            setEditing(null)
            setInvoiceDialog({ tenantId })
          }}
        />
      )}
      {invoiceDialog && (
        <InvoiceDialog
          edit={"edit" in invoiceDialog ? invoiceDialog.edit : null}
          prefill={invoicePrefillFor(invoiceDialog, month, today)}
          onClose={() => setInvoiceDialog(null)}
          onSaved={() => {
            setInvoiceDialog(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

type InvoiceDialogState =
  | { tenantId: string | null }
  | { edit: { tenantId: string; invoiceId: string } }

/** A new merchant invoice is issued in the month on screen: today in this month, else its first day. */
function invoicePrefillFor(
  state: InvoiceDialogState,
  month: string,
  thisMonth: string,
): InvoicePrefill | null {
  if (!("tenantId" in state)) return null
  return {
    tenantId: state.tenantId ?? "",
    // The merchant's billing rule decides the period (as in its Facturación tab).
    period: null,
    months: 0,
    amount: null,
    issuedOn: month === thisMonth ? todayLima() : `${month}-01`,
  }
}

/**
 * Facturación invoices of this month with no sale yet (registered before
 * Ventas existed): one click creates it when the number reads serie-número.
 */
function PendingInvoices({
  invoices,
  onCreated,
}: {
  invoices: DocumentsPage["pendingInvoices"]
  onCreated: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  if (invoices.length === 0) return null
  async function create(id: string) {
    setBusy(id)
    try {
      await api("POST", "/api/admin/finance/documents/from-invoice", { invoiceId: id })
      toast.success("Venta creada")
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear")
    } finally {
      setBusy(null)
    }
  }
  return (
    <Notice tone="warn">
      <span className="block">
        {invoices.length === 1
          ? "1 factura de Facturación de este mes todavía no está en Ventas:"
          : `${invoices.length} facturas de Facturación de este mes todavía no están en Ventas:`}
      </span>
      {invoices.map((i) => (
        <span key={i.id} className="flex items-center gap-2 mt-1 flex-wrap">
          <span>
            {i.tenantName} · {i.number ?? "sin número"} · {money(i.amount, i.currency)}
          </span>
          {i.numberOk ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11.5px] px-2"
              disabled={busy === i.id}
              onClick={() => create(i.id)}
            >
              {busy === i.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Crear venta"}
            </Button>
          ) : (
            <span className="text-ent-fg-3">
              el número no es serie-número: anúlala y regístrala de nuevo en Facturación
            </span>
          )}
        </span>
      ))}
    </Notice>
  )
}

/* ───────────────────────── Row ───────────────────────── */

function DocRow({
  d,
  direction,
  onEdit,
  onStatus,
  onDelete,
  onChanged,
  closed,
}: {
  d: Doc
  direction: Direction
  onEdit: () => void
  onStatus: (s: "registered" | "void") => void
  onDelete: () => void
  onChanged: () => void
  closed: boolean
}) {
  const sign = docSign(d.docType)
  return (
    <Tr className={d.status === "void" ? "opacity-60" : undefined}>
      <Td className="whitespace-nowrap">{ymd(d.issueDate)}</Td>
      <Td className="whitespace-nowrap">
        <span className="font-medium">{d.number}</span>
        <span className="block text-[11px] text-ent-fg-3">
          {d.docTypeLabel}
          {d.status === "void" ? " · anulado" : ""}
        </span>
      </Td>
      <Td>
        {d.tenantId ? (
          <Link href={`/admin/tenants/${d.tenantId}`} className="hover:underline">
            {d.counterpartyName}
          </Link>
        ) : (
          d.counterpartyName
        )}
        {d.counterpartyDoc ? (
          <span className="block text-[11px] text-ent-fg-3">{d.counterpartyDoc}</span>
        ) : null}
        {d.recurringName ? (
          <span className="block text-[11px] text-ent-fg-3">Costo fijo: {d.recurringName}</span>
        ) : null}
      </Td>
      <Td align="right">{money(sign * (d.baseGravada + d.baseNoGravada), d.currency)}</Td>
      <Td align="right">{money(sign * d.igv, d.currency)}</Td>
      <Td align="right">
        {money(sign * d.total, d.currency)}
        {d.currency === "USD" && d.fxRate ? (
          <span className="block text-[11px] text-ent-fg-3">
            {soles(toPen(sign * d.total, "USD", d.fxRate))} · TC {d.fxRate}
          </span>
        ) : null}
      </Td>
      <Td>{direction === "sale" ? <CollectionCell d={d} /> : <IgvCell d={d} />}</Td>
      <FilesCell d={d} direction={direction} onChanged={onChanged} />
      <ActionsCell d={d} closed={closed} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete} />
    </Tr>
  )
}

/** Sales: collection state of the linked Facturación invoice, or the paid date. */
function CollectionCell({ d }: { d: Doc }) {
  if (d.invoice) {
    const s = d.invoice.status
    return (
      <StatusChip tone={s === "paid" ? "ok" : s === "void" ? "mute" : "warn"}>
        {s === "paid" ? "Pagada" : s === "void" ? "Anulada" : "Pendiente"}
      </StatusChip>
    )
  }
  if (d.paidOn) return <StatusChip tone="ok">Pagada</StatusChip>
  return <span className="text-[12px] text-ent-fg-3">—</span>
}

/** Purchases: how the IGV is treated and whether it counts for renta. */
function IgvCell({ d }: { d: Doc }) {
  if (!d.igvTreatment) return null
  return (
    <span className="text-[12px] text-ent-fg-2">
      {IGV_TREATMENT_LABEL[d.igvTreatment as IgvTreatment]}
      {d.rentaDeductible ? (
        <span className="block text-[11px] text-ent-fg-3">{RENTA_LABEL[d.rentaDeductible]}</span>
      ) : null}
    </span>
  )
}

function FilesCell({
  d,
  direction,
  onChanged,
}: {
  d: Doc
  direction: Direction
  onChanged: () => void
}) {
  return (
    <Td>
      <div className="flex flex-col gap-0.5">
        {(["pdf", "xml", "cdr"] as DocumentFileKind[])
          .filter((k) => direction === "sale" || k !== "cdr")
          .map((k) => (
            <FileSlot key={k} doc={d} kind={k} onChanged={onChanged} />
          ))}
        {!d.files.pdf && d.invoice?.hasFile && d.tenantId ? (
          <a
            href={`/api/admin/tenants/${d.tenantId}/billing/invoices/${d.invoice.id}/files/invoice`}
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] text-ent-accent hover:underline"
          >
            PDF de Facturación
          </a>
        ) : null}
      </div>
    </Td>
  )
}

/** Edit / void / delete; a merchant invoice opens its invoice dialog; all locked in a closed month. */
function ActionsCell({
  d,
  closed,
  onEdit,
  onStatus,
  onDelete,
}: {
  d: Doc
  closed: boolean
  onEdit: () => void
  onStatus: (s: "registered" | "void") => void
  onDelete: () => void
}) {
  const lockedTitle = "Mes cerrado: reábrelo en Cierres para cambiarlo"
  if (d.invoice) {
    // A merchant invoice: edited, voided or deleted in its invoice dialog.
    return (
      <Td align="right" className="whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={closed ? lockedTitle : "Editar, anular o eliminar la factura"}
          disabled={closed}
          onClick={onEdit}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </Td>
    )
  }
  const linked = closed
  return (
    <Td align="right" className="whitespace-nowrap">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={linked ? lockedTitle : "Editar"}
        disabled={linked}
        onClick={onEdit}
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      {d.status === "void" ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={linked ? lockedTitle : "Reactivar"}
          disabled={linked}
          onClick={() => onStatus("registered")}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={linked ? lockedTitle : "Anular"}
          disabled={linked}
          onClick={() => onStatus("void")}
        >
          <Ban className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={linked ? lockedTitle : "Eliminar"}
        disabled={linked}
        onClick={onDelete}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </Td>
  )
}

function FileSlot({
  doc,
  kind,
  onChanged,
}: {
  doc: Doc
  kind: DocumentFileKind
  onChanged: () => void
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const rule = DOCUMENT_FILE_RULES[kind]
  const current = doc.files[kind]

  async function upload(file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set("kind", kind)
      fd.set("file", file)
      const res = await fetch(`/api/admin/finance/documents/${doc.id}/files`, {
        method: "POST",
        body: fd,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo subir el archivo")
      toast.success(`${rule.label} adjuntado`)
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
      {current ? (
        <a
          href={`/api/admin/finance/documents/${doc.id}/files/${kind}`}
          target="_blank"
          rel="noreferrer"
          title={current.name}
          className="inline-flex items-center gap-1 text-ent-accent hover:underline"
        >
          <FileText className="w-3 h-3" /> {rule.label}
        </a>
      ) : (
        <span className="text-ent-fg-3">{rule.label}: —</span>
      )}
      <button
        type="button"
        className="text-ent-fg-3 hover:text-ent-fg-2 disabled:opacity-50"
        title={current ? `Reemplazar ${rule.label}` : `Subir ${rule.label}`}
        aria-label={`Subir ${rule.label}`}
        disabled={busy}
        onClick={() => ref.current?.click()}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
      </button>
      <input
        ref={ref}
        type="file"
        accept={rule.accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
        }}
      />
    </span>
  )
}

/* ───────────────────────── Form ───────────────────────── */

/**
 * Where a purchase goes in Costos e ingresos, so nothing is entered twice:
 * a new variable cost, the receipt of a fixed cost already there (Hetzner,
 * Apple…), or nowhere.
 */
function CostLinkSelect({
  value,
  editing,
  hadEntry,
  costs,
  current,
  onChange,
}: {
  value: string
  editing: boolean
  hadEntry: boolean
  costs: DocumentsPage["recurringCosts"]
  /** The fixed cost this purchase is linked to, listed even if it has ended. */
  current: { id: string; name: string } | null
  onChange: (v: string) => void
}) {
  const ended = current && !costs.some((c) => c.id === current.id) ? current : null
  return (
    <div className="space-y-1 col-span-2 sm:col-span-4">
      <Label className="text-xs">En Costos e ingresos</Label>
      <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="new">
          {editing && hadEntry
            ? "Costo variable creado con esta compra"
            : "Registrar como costo variable nuevo"}
        </option>
        {(costs.length > 0 || ended) && (
          <optgroup label="Es el comprobante de un costo fijo">
            {ended && <option value={ended.id}>{ended.name} · terminado</option>}
            {costs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {money(c.amount, c.currency)}
              </option>
            ))}
          </optgroup>
        )}
        <option value="none">No registrar en Costos</option>
      </select>
      <p className="text-[11px] text-ent-fg-3">
        Si es un costo fijo que ya está en Costos e ingresos, elígelo: no se crea otro y el costo
        fijo queda con su comprobante del mes.
      </p>
    </div>
  )
}

type Form = {
  docType: DocType
  serie: string
  numero: string
  issueDate: string
  taxPeriod: string
  tenantId: string
  supplierId: string
  counterpartyDoc: string
  counterpartyName: string
  currency: "PEN" | "USD"
  fxRate: string
  baseGravada: string
  baseNoGravada: string
  igv: string
  total: string
  igvTreatment: IgvTreatment | ""
  rentaDeductible: "si" | "no" | "limitado" | ""
  category: string
  detraccionPct: string
  detraccionConstancia: string
  paidOn: string
  notes: string
  /** Purchases: "new" (create a variable cost), "none", or the id of a fixed cost this is the receipt of. */
  costLink: string
}

function formFrom(doc: Doc | null, direction: Direction, month: string): Form {
  const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })
  const date = todayYmd.startsWith(month) ? todayYmd : `${month}-01`
  if (!doc) {
    return {
      docType: "01",
      serie: direction === "sale" ? "F001" : "",
      numero: "",
      issueDate: date,
      taxPeriod: month,
      tenantId: "",
      supplierId: "",
      counterpartyDoc: "",
      counterpartyName: "",
      currency: "PEN",
      fxRate: "",
      baseGravada: "",
      baseNoGravada: "0",
      igv: "",
      total: "",
      igvTreatment: direction === "purchase" ? "credito" : "",
      rentaDeductible: direction === "purchase" ? "si" : "",
      category: FINANCE_COST_CATEGORIES[0],
      detraccionPct: "",
      detraccionConstancia: "",
      paidOn: "",
      notes: "",
      costLink: direction === "purchase" ? "new" : "none",
    }
  }
  return {
    docType: doc.docType,
    serie: doc.serie,
    numero: doc.numero,
    issueDate: doc.issueDate,
    taxPeriod: doc.taxPeriod,
    tenantId: doc.tenantId ?? "",
    supplierId: doc.supplierId ?? "",
    counterpartyDoc: doc.counterpartyDoc ?? "",
    counterpartyName: doc.counterpartyName,
    currency: doc.currency,
    fxRate: doc.fxRate ? String(doc.fxRate) : "",
    baseGravada: String(doc.baseGravada),
    baseNoGravada: String(doc.baseNoGravada),
    igv: String(doc.igv),
    total: String(doc.total),
    igvTreatment: (doc.igvTreatment as IgvTreatment | null) ?? "",
    rentaDeductible: doc.rentaDeductible ?? "",
    category: doc.category ?? FINANCE_COST_CATEGORIES[0],
    detraccionPct: doc.detraccionRate ? String(Math.round(doc.detraccionRate * 10000) / 100) : "",
    detraccionConstancia: doc.detraccionConstancia ?? "",
    paidOn: doc.paidOn ?? "",
    notes: doc.notes ?? "",
    costLink: doc.recurringItemId ?? (doc.entryId ? "new" : "none"),
  }
}

type Supplier = DocumentsPage["suppliers"][number]

/** The form with a supplier chosen: its default IGV treatment and category; foreign ones are "del exterior". */
function withSupplier(p: Form, id: string, s: Supplier | undefined): Form {
  return {
    ...p,
    supplierId: id,
    ...(s?.defaultIgvTreatment ? { igvTreatment: s.defaultIgvTreatment } : {}),
    ...(s && !s.domiciled
      ? { docType: "91" as DocType, igvTreatment: "no_domiciliado" as const }
      : {}),
    // Back to a Peruvian supplier: drop what only fits a foreign one.
    ...(s?.domiciled && p.docType === "91" ? { docType: "01" as DocType } : {}),
    ...(s?.domiciled && !s.defaultIgvTreatment && p.igvTreatment === "no_domiciliado"
      ? { igvTreatment: "credito" as const }
      : {}),
    ...(s?.defaultCategory ? { category: s.defaultCategory } : {}),
  }
}

/** Purchases: the supplier by its RUC (or one to add), and whether the invoice is addressed to Cuik. */
function purchaseFromUbl(doc: UblDocument, data: DocumentsPage, p: Form) {
  const warnings: string[] = []
  const issuer = data.issuer
  if (issuer && doc.customer.doc && doc.customer.doc !== issuer.ruc) {
    warnings.push(
      `Está a nombre de ${doc.customer.name || doc.customer.doc}, no de ${issuer.razonSocial}: no da crédito fiscal ni es gasto de Cuik.`,
    )
  }
  if (doc.docType === "03") {
    warnings.push("Una boleta no da crédito fiscal: queda como «Sin crédito fiscal».")
  }
  const s = data.suppliers.find((x) => x.docNumber === doc.supplier.doc)
  const form = s ? withSupplier(p, s.id, s) : { ...p, supplierId: "" }
  const newSupplier =
    !s && doc.supplier.doc ? { ruc: doc.supplier.doc, name: doc.supplier.name } : null
  return {
    form: doc.docType === "03" ? { ...form, igvTreatment: "sin_credito" as const } : form,
    warnings,
    newSupplier,
  }
}

/** Sales: the merchant by its RUC, else the customer as written; issued by Cuik. */
function saleFromUbl(doc: UblDocument, data: DocumentsPage, p: Form) {
  const warnings: string[] = []
  if (data.issuer && doc.supplier.doc !== data.issuer.ruc) {
    warnings.push(`Este XML no lo emitió ${data.issuer.razonSocial}: no es una venta de Cuik.`)
  }
  const t = data.tenants.find((x) => x.ruc && x.ruc === doc.customer.doc)
  const form: Form = {
    ...p,
    tenantId: t?.id ?? "",
    counterpartyDoc: t ? "" : (doc.customer.doc ?? ""),
    counterpartyName: t ? "" : doc.customer.name,
  }
  return { form, warnings, newSupplier: null }
}

/** The form filled from a SUNAT XML: what it says wins over what was typed. */
function fillFromUbl(doc: UblDocument, direction: Direction, data: DocumentsPage, p: Form) {
  const party = direction === "purchase" ? purchaseFromUbl(doc, data, p) : saleFromUbl(doc, data, p)
  const form: Form = {
    ...party.form,
    docType: doc.docType,
    serie: doc.serie,
    numero: doc.numero,
    issueDate: doc.issueDate,
    taxPeriod: doc.issueDate.slice(0, 7),
    currency: doc.currency,
    baseGravada: String(doc.baseGravada),
    baseNoGravada: String(doc.baseNoGravada),
    igv: String(doc.igv),
    total: String(doc.total),
    detraccionPct: doc.detraccionPct ? String(doc.detraccionPct) : party.form.detraccionPct,
    notes: doc.reference && !p.notes ? `Modifica ${doc.reference}` : party.form.notes,
  }
  const warnings = [...doc.warnings, ...party.warnings]
  if (doc.currency === "USD" && !form.fxRate) {
    warnings.push("Está en dólares: escribe el tipo de cambio SUNAT de la fecha de emisión.")
  }
  return { form, warnings, newSupplier: party.newSupplier }
}

function DocumentDialog({
  direction,
  data,
  doc,
  onClose,
  onSaved,
  onSuppliersChanged,
  onMerchantInvoice,
}: {
  direction: Direction
  data: DocumentsPage
  doc: Doc | null
  onClose: () => void
  onSaved: (taxPeriod: string) => void
  onSuppliersChanged: () => void
  /** A new invoice to a merchant: switch to the merchant invoice dialog. */
  onMerchantInvoice: (tenantId: string) => void
}) {
  const [f, setF] = useState<Form>(() => formFrom(doc, direction, data.month))
  const [busy, setBusy] = useState(false)
  const igvRate = data.igvRate ?? 0.18
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  function splitFromTotal(gravado: boolean) {
    const total = Number(f.total)
    if (!(total > 0)) return
    if (!gravado) {
      setF((p) => ({ ...p, baseGravada: "0", baseNoGravada: String(total), igv: "0" }))
      return
    }
    const s = splitIgv(total, true, igvRate)
    setF((p) => ({ ...p, baseGravada: String(s.base), baseNoGravada: "0", igv: String(s.igv) }))
  }

  function pickSupplier(id: string) {
    setF((p) =>
      withSupplier(
        p,
        id,
        data.suppliers.find((x) => x.id === id),
      ),
    )
  }

  // "Llenar desde XML": the parsed document, attached when saving.
  const [xml, setXml] = useState<XmlFillState | null>(null)
  const [addingSupplier, setAddingSupplier] = useState(false)
  async function pickXml(file: File) {
    try {
      const parsed = parseUbl(await file.text())
      const r = fillFromUbl(parsed, direction, data, f)
      setF(r.form)
      setXml({ file, doc: parsed, warnings: r.warnings, newSupplier: r.newSupplier })
    } catch (e) {
      toast.error(e instanceof UblError ? e.message : "No se pudo leer el XML")
    }
  }
  async function addXmlSupplier() {
    const ns = xml?.newSupplier
    if (!ns) return
    setAddingSupplier(true)
    try {
      const r = await api<{ id: string | null }>("POST", "/api/admin/finance/suppliers", {
        docType: "ruc",
        docNumber: ns.ruc,
        name: ns.name || ns.ruc,
        country: "PE",
        domiciled: true,
      })
      onSuppliersChanged()
      if (r.id) set("supplierId", r.id)
      setXml((x) => (x ? { ...x, newSupplier: null } : x))
      toast.success("Proveedor agregado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar el proveedor")
    } finally {
      setAddingSupplier(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const num = (v: string) => (v.trim() === "" ? 0 : Number(v))
      const body = {
        direction,
        docType: f.docType,
        serie: f.serie,
        numero: f.numero,
        issueDate: f.issueDate,
        taxPeriod: f.taxPeriod,
        tenantId: f.tenantId,
        supplierId: f.supplierId,
        // A tenant brings its own RUC and razón social.
        counterpartyDoc: f.tenantId ? "" : f.counterpartyDoc,
        counterpartyName: f.tenantId ? "" : f.counterpartyName,
        currency: f.currency,
        fxRate: f.currency === "USD" && f.fxRate ? Number(f.fxRate) : null,
        baseGravada: num(f.baseGravada),
        baseNoGravada: num(f.baseNoGravada),
        igv: num(f.igv),
        total: num(f.total),
        igvTreatment: f.igvTreatment,
        rentaDeductible: f.rentaDeductible,
        category: direction === "purchase" ? f.category : "",
        detraccionRate: f.detraccionPct ? Math.round(Number(f.detraccionPct) * 100) / 10000 : null,
        detraccionConstancia: f.detraccionConstancia,
        paidOn: f.paidOn,
        notes: f.notes,
        createCostEntry: direction === "purchase" && f.docType !== "07" && f.costLink === "new",
        recurringItemId:
          direction === "purchase" &&
          f.docType !== "07" &&
          f.costLink !== "new" &&
          f.costLink !== "none"
            ? f.costLink
            : null,
      }
      let id = doc?.id ?? null
      if (doc) await api("PUT", `/api/admin/finance/documents/${doc.id}`, body)
      else id = (await api<{ id: string | null }>("POST", "/api/admin/finance/documents", body)).id
      toast.success(await savedMessage(!!doc, id, xml?.file ?? null))
      onSaved(f.taxPeriod)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  /** Attaches the XML (if one was used) and says what was saved. */
  async function savedMessage(edited: boolean, id: string | null, file: File | null) {
    const done = edited ? "Comprobante actualizado" : "Comprobante registrado"
    if (!file || !id) return edited ? done : `${done}: adjunta el PDF y el XML desde la lista`
    try {
      await uploadDocumentFile(id, "xml", file)
      return `${done} con su XML${edited ? "" : ": adjunta el PDF desde la lista"}`
    } catch (e) {
      return `${done}, pero el XML no se adjuntó (${e instanceof Error ? e.message : "error"}): súbelo desde la lista`
    }
  }

  // Invoices and boletas to a merchant are its Facturación invoices (one record, in Cobranza too).
  const merchantInvoice =
    !doc && direction === "sale" && !!f.tenantId && (f.docType === "01" || f.docType === "03")
  const ready =
    !merchantInvoice &&
    f.serie.trim() !== "" &&
    f.numero.trim() !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.issueDate) &&
    MONTH_RE.test(f.taxPeriod) &&
    f.total.trim() !== "" &&
    (direction === "sale" ? !!f.tenantId || f.counterpartyName.trim() !== "" : !!f.supplierId)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {doc
              ? `Editar ${doc.number}`
              : direction === "sale"
                ? "Registrar venta"
                : "Registrar compra"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
          <XmlFill
            state={xml}
            onPick={pickXml}
            onClear={() => setXml(null)}
            onAddSupplier={addXmlSupplier}
            addingSupplier={addingSupplier}
          />
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <select
              className={sel}
              value={f.docType}
              onChange={(e) => set("docType", e.target.value as DocType)}
            >
              {DOC_TYPES_BY_DIRECTION[direction].map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Serie</Label>
            <Input
              value={f.serie}
              maxLength={4}
              onChange={(e) => set("serie", e.target.value.toUpperCase())}
              placeholder="F001"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Número</Label>
            <Input
              value={f.numero}
              inputMode="numeric"
              onChange={(e) => set("numero", e.target.value.replace(/\D/g, ""))}
              placeholder="123"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha de emisión</Label>
            <Input
              type="date"
              value={f.issueDate}
              onChange={(e) => {
                const v = e.target.value
                // The period follows the date until the user sets it apart.
                setF((p) => ({
                  ...p,
                  issueDate: v,
                  taxPeriod: p.taxPeriod === p.issueDate.slice(0, 7) ? v.slice(0, 7) : p.taxPeriod,
                }))
              }}
            />
          </div>

          {direction === "sale" ? (
            <>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Comercio</Label>
                <select
                  className={sel}
                  value={f.tenantId}
                  onChange={(e) => set("tenantId", e.target.value)}
                >
                  <option value="">Otro cliente (no es comercio Cuik)</option>
                  {data.tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.ruc ? ` · ${t.ruc}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {merchantInvoice && (
                <div className="col-span-2 sm:col-span-4">
                  <Notice tone="info">
                    Una factura a un comercio se registra como factura del comercio: así queda en su
                    cobranza y aquí en Ventas, una sola vez.{" "}
                    <button
                      type="button"
                      className="text-ent-accent hover:underline"
                      onClick={() => onMerchantInvoice(f.tenantId)}
                    >
                      Registrar factura del comercio
                    </button>
                  </Notice>
                </div>
              )}
              {!f.tenantId && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">RUC / DNI del cliente</Label>
                    <Input
                      value={f.counterpartyDoc}
                      onChange={(e) => set("counterpartyDoc", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Razón social / nombre</Label>
                    <Input
                      value={f.counterpartyName}
                      onChange={(e) => set("counterpartyName", e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="space-y-1 col-span-2 sm:col-span-4">
              <Label className="text-xs">Proveedor</Label>
              <select
                className={sel}
                value={f.supplierId}
                onChange={(e) => pickSupplier(e.target.value)}
              >
                <option value="">Elige un proveedor…</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.docNumber ? ` · ${s.docNumber}` : ""}
                    {s.domiciled ? "" : " · exterior"}
                  </option>
                ))}
              </select>
              {data.suppliers.length === 0 && (
                <p className="text-[11.5px] text-ent-fg-3">
                  Primero agrega el proveedor en la pestaña Proveedores.
                </p>
              )}
              <button
                type="button"
                className="text-[11.5px] text-ent-accent hover:underline"
                onClick={onSuppliersChanged}
              >
                Actualizar lista
              </button>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Moneda</Label>
            <select
              className={sel}
              value={f.currency}
              onChange={(e) => set("currency", e.target.value as "PEN" | "USD")}
            >
              <option value="PEN">S/ soles</option>
              <option value="USD">US$ dólares</option>
            </select>
          </div>
          {f.currency === "USD" && (
            <div className="space-y-1">
              <Label className="text-xs">Tipo de cambio</Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={f.fxRate}
                onChange={(e) => set("fxRate", e.target.value)}
                placeholder="3.750"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Total</Label>
            <Input
              type="number"
              step="0.01"
              value={f.total}
              onChange={(e) => set("total", e.target.value)}
            />
          </div>
          <div className="space-y-1 flex flex-col justify-end">
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 text-[11.5px] px-2"
                onClick={() => splitFromTotal(true)}
              >
                Separar IGV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 text-[11.5px] px-2"
                onClick={() => splitFromTotal(false)}
              >
                Sin IGV
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Base gravada</Label>
            <Input
              type="number"
              step="0.01"
              value={f.baseGravada}
              onChange={(e) => set("baseGravada", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">No gravado / exonerado</Label>
            <Input
              type="number"
              step="0.01"
              value={f.baseNoGravada}
              onChange={(e) => set("baseNoGravada", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">IGV</Label>
            <Input
              type="number"
              step="0.01"
              value={f.igv}
              onChange={(e) => set("igv", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {direction === "purchase" ? "Periodo del crédito" : "Periodo"}
            </Label>
            <Input
              type="month"
              value={f.taxPeriod}
              onChange={(e) => MONTH_RE.test(e.target.value) && set("taxPeriod", e.target.value)}
            />
          </div>

          {direction === "purchase" && (
            <>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">IGV de la compra</Label>
                <select
                  className={sel}
                  value={f.igvTreatment}
                  onChange={(e) => set("igvTreatment", e.target.value as IgvTreatment)}
                >
                  {(Object.keys(IGV_TREATMENT_LABEL) as IgvTreatment[]).map((t) => (
                    <option key={t} value={t}>
                      {IGV_TREATMENT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Para renta</Label>
                <select
                  className={sel}
                  value={f.rentaDeductible}
                  onChange={(e) =>
                    set("rentaDeductible", e.target.value as Form["rentaDeductible"])
                  }
                >
                  <option value="si">{RENTA_LABEL.si}</option>
                  <option value="limitado">{RENTA_LABEL.limitado}</option>
                  <option value="no">{RENTA_LABEL.no}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <select
                  className={sel}
                  value={f.category}
                  onChange={(e) => set("category", e.target.value)}
                >
                  {FINANCE_COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Detracción (%)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={f.detraccionPct}
              onChange={(e) => set("detraccionPct", e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Constancia de detracción</Label>
            <Input
              value={f.detraccionConstancia}
              onChange={(e) => set("detraccionConstancia", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pagado el</Label>
            <Input type="date" value={f.paidOn} onChange={(e) => set("paidOn", e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-4">
            <Label className="text-xs">Notas</Label>
            <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {direction === "purchase" && f.docType !== "07" && (
            <CostLinkSelect
              value={f.costLink}
              editing={!!doc}
              hadEntry={!!doc?.entryId}
              costs={data.recurringCosts}
              current={
                doc?.recurringItemId
                  ? { id: doc.recurringItemId, name: doc.recurringName ?? "Costo fijo" }
                  : null
              }
              onChange={(v) => set("costLink", v)}
            />
          )}
          {direction === "sale" && Number(f.total) > 700 && (
            <p className="col-span-2 sm:col-span-4 text-[11.5px] text-ent-fg-3">
              Más de S/ 700: puede corresponder detracción, y retención si el cliente es agente de
              retención.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={busy || !ready} onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
