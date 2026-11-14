"use client"

import { Download, FileText, Loader2, Lock, LockOpen, Save, Upload } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  FieldList,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LineMatch } from "@/lib/admin/close"
import { apiCall, apiUpload, soles, solesInt, ymd } from "@/lib/admin/format"
import { monthShort } from "@/lib/admin/issuers"
import type { ClosesPage } from "@/lib/admin/periods-data"
import { cn } from "@/lib/utils"

type Available = Extract<ClosesPage, { available: true }>
type Detail = NonNullable<Available["detail"]>

/**
 * Finanzas › Cierres: each month's PDT 621 (IGV and 1 % pago a cuenta), the
 * 10 % reserve moved to the bank, and the accountant's close imported from
 * the template and reconciled with the panel. Closing a month locks its
 * documents and makes the declared figures carry forward.
 */
export function CierresClient() {
  const [month, setMonth] = useState<string | null>(null)
  const [data, setData] = useState<ClosesPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month")
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setMonth(m)
  }, [])

  const refresh = useCallback(async () => {
    const req = ++requestRef.current
    try {
      const res = await fetch(`/api/admin/finance/periods${month ? `?month=${month}` : ""}`)
      const json = await res.json()
      if (req !== requestRef.current) return
      if (!json.success) throw new Error(json.error)
      setData(json.data)
      setError(null)
    } catch (e) {
      if (req !== requestRef.current) return
      setError(e instanceof Error ? e.message : "Error de conexión")
    }
  }, [month])
  useEffect(() => {
    refresh()
  }, [refresh])

  const header = (
    <PageHeader
      crumbs={[
        { label: "Inicio", href: "/admin" },
        { label: "Finanzas", href: "/admin/finanzas/tablero" },
        { label: "Cierres" },
      ]}
      title="Cierres mensuales"
      subtitle={
        data?.available
          ? `${data.issuer.razonSocial} · RUC ${data.issuer.ruc}`
          : "Declaración mensual, reserva y cierre del contador"
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
  if (!data.available) {
    return (
      <div className="space-y-3">
        {header}
        <Notice tone="info">
          Todavía no hay meses con régimen tributario. Revisa Finanzas › Empresa y régimen.
        </Notice>
      </div>
    )
  }
  const reserveDue = data.months.reduce((a, m) => a + m.annualReserve, 0)
  return (
    <div className="space-y-3">
      {header}
      <StatStrip
        stats={[
          { label: "Meses", value: data.months.length },
          {
            label: "Cerrados",
            value: data.months.filter((m) => m.status === "closed").length,
          },
          { label: "Reserva a separar", value: soles(reserveDue) },
          {
            label: "Reserva separada en el banco",
            value: soles(data.reserveMovedTotal),
            tone: data.reserveMovedTotal + 0.005 >= reserveDue ? "ok" : "warn",
          },
        ]}
      />
      <MonthsTable data={data} selected={data.detail?.month ?? null} onSelect={setMonth} />
      {data.detail && <DetailPanels key={data.detail.month} d={data.detail} onChanged={refresh} />}
    </div>
  )
}

function MonthsTable({
  data,
  selected,
  onSelect,
}: {
  data: Available
  selected: string | null
  onSelect: (m: string) => void
}) {
  return (
    <Panel>
      <PanelHeader title="Meses" />
      <DataTable>
        <thead>
          <tr>
            <Th>Mes</Th>
            <Th>Estado</Th>
            <Th>Vence</Th>
            <Th align="right">IGV</Th>
            <Th align="right">Renta 1 %</Th>
            <Th align="right">A SUNAT</Th>
            <Th align="right">Reserva 10 %</Th>
            <Th>Reserva en el banco</Th>
            <Th>Contador</Th>
          </tr>
        </thead>
        <tbody>
          {data.months.map((m) => (
            <Tr
              key={m.month}
              className={cn("cursor-pointer", m.month === selected && "bg-ent-accent-soft")}
              onClick={() => onSelect(m.month)}
            >
              <Td className="font-medium">{monthShort(m.month)}</Td>
              <Td>
                <StatusChip tone={m.status === "closed" ? "ok" : "warn"}>
                  {m.status === "closed" ? "Cerrado" : "Abierto"}
                </StatusChip>
              </Td>
              <Td>{ymd(m.dueDate)}</Td>
              <Td align="right">{solesInt(m.igvToPay)}</Td>
              <Td align="right">{solesInt(m.incomeAdvance)}</Td>
              <Td align="right" className="font-semibold">
                {solesInt(m.payToSunat)}
              </Td>
              <Td align="right">{soles(m.annualReserve)}</Td>
              <Td>
                <ReserveChip m={m} />
              </Td>
              <Td>
                <AccountantChip m={m} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  )
}

type MonthRow = Available["months"][number]

/** The 10 % moved to the bank for that month, or pending. */
function ReserveChip({ m }: { m: MonthRow }) {
  if (!m.reserveMovedOn) return <StatusChip tone="mute">Pendiente</StatusChip>
  return (
    <StatusChip tone={(m.reserveAmount ?? 0) + 0.005 >= m.annualReserve ? "ok" : "warn"}>
      {soles(m.reserveAmount ?? 0)} · {ymd(m.reserveMovedOn)}
    </StatusChip>
  )
}

/** State of the accountant's close for the month. */
function AccountantChip({ m }: { m: MonthRow }) {
  if (m.importedAt === null) return <span className="text-[12px] text-ent-fg-3">Sin importar</span>
  if (m.summaryCompared === 0) return <StatusChip tone="warn">Sin resumen</StatusChip>
  if (m.summaryDiffs) {
    return (
      <StatusChip tone="bad">
        {m.summaryDiffs === 1 ? "1 diferencia" : `${m.summaryDiffs} diferencias`}
      </StatusChip>
    )
  }
  return <StatusChip tone="ok">Coincide</StatusChip>
}

function DetailPanels({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  return (
    <>
      <ActionsPanel d={d} onChanged={onChanged} />
      <ReservePanel d={d} onChanged={onChanged} />
      <SummaryPanel d={d} />
      <LinesPanel d={d} />
    </>
  )
}

function ActionsPanel({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  const importRef = useRef<HTMLInputElement | null>(null)
  const constRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const closed = d.status === "closed"
  const base = `/api/admin/finance/periods/${d.month}`

  async function run(name: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(name)
    try {
      await fn()
      toast.success(ok)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar")
    } finally {
      setBusy(null)
    }
  }
  async function importFile(file: File) {
    await run(
      "import",
      async () => {
        const res = await apiUpload<{ errors?: string[] }>(`${base}/import`, file)
        if (res.errors?.length)
          toast.warning(`${res.errors.length} filas con errores: ${res.errors[0]}`)
      },
      "Cierre del contador importado",
    )
    if (importRef.current) importRef.current.value = ""
  }
  function close() {
    const warn = d.import
      ? ""
      : "Todavía no importaste el cierre del contador: se guardará solo lo calculado por el panel. "
    if (!confirm(`${warn}¿Cerrar ${monthShort(d.month)}? Sus comprobantes quedarán bloqueados.`))
      return
    run("close", () => apiCall("POST", `${base}/close`), `${monthShort(d.month)} cerrado`)
  }
  function reopen() {
    const reason = prompt("Motivo para reabrir el mes (queda registrado):")
    if (!reason) return
    run(
      "reopen",
      () => apiCall("POST", `${base}/reopen`, { reason }),
      `${monthShort(d.month)} reabierto`,
    )
  }

  return (
    <Panel>
      <PanelHeader
        title={`Cierre de ${monthShort(d.month)}`}
        actions={
          <StatusChip tone={closed ? "ok" : "warn"}>{closed ? "Cerrado" : "Abierto"}</StatusChip>
        }
      />
      <div className="p-3 space-y-3">
        {closed && (
          <Notice tone="info">
            Mes cerrado{d.period?.closedAt ? ` el ${ymd(d.period.closedAt.slice(0, 10))}` : ""}: sus
            comprobantes no se pueden cambiar y sus cifras quedaron fijas:{" "}
            {d.import ? "lo declarado por el contador" : "lo calculado al cerrar"}, que pasa al mes
            siguiente.
          </Notice>
        )}
        {!closed && d.period?.reopenedReason && (
          <Notice tone="warn">Reabierto: {d.period.reopenedReason}</Notice>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
            <a href={`${base}/template`}>
              <Download className="w-3.5 h-3.5" /> Descargar plantilla para el contador
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px] gap-1.5"
            disabled={closed || busy !== null}
            title={closed ? "Reabre el mes para importar otro cierre" : undefined}
            onClick={() => importRef.current?.click()}
          >
            {busy === "import" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Importar cierre del contador
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px] gap-1.5"
            disabled={busy !== null}
            onClick={() => constRef.current?.click()}
          >
            {busy === "const" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            {d.period?.constancia ? "Reemplazar constancia" : "Adjuntar constancia (PDF)"}
          </Button>
          {d.period?.constancia && (
            <Button asChild size="sm" variant="ghost" className="h-7 text-[12px]">
              <a href={`${base}/constancia`} target="_blank" rel="noreferrer">
                Ver constancia
              </a>
            </Button>
          )}
          <span className="flex-1" />
          {closed ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[12px] gap-1.5"
              disabled={busy !== null}
              onClick={reopen}
            >
              <LockOpen className="w-3.5 h-3.5" /> Reabrir
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-[12px] gap-1.5"
              disabled={busy !== null}
              onClick={close}
            >
              {busy === "close" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              Cerrar mes
            </Button>
          )}
        </div>
        {d.import && (
          <p className="text-[12px] text-ent-fg-3">
            Último cierre importado: {d.import.fileName ?? "Excel"} ·{" "}
            {ymd(d.import.importedAt.slice(0, 10))} · {d.import.lineCount} comprobantes
            {d.import.numeroOrden ? ` · N.° de orden ${d.import.numeroOrden}` : ""}
            {d.import.fechaPresentacion ? ` · presentado el ${d.import.fechaPresentacion}` : ""}
          </p>
        )}
        <input
          ref={importRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importFile(f)
          }}
        />
        <input
          ref={constRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) run("const", () => apiUpload(`${base}/constancia`, f), "Constancia adjuntada")
            if (constRef.current) constRef.current.value = ""
          }}
        />
      </div>
    </Panel>
  )
}

function ReservePanel({ d, onChanged }: { d: Detail; onChanged: () => void }) {
  const [f, setF] = useState({
    dueDate: d.period?.dueDate ?? d.calendarDue ?? "",
    reserveMovedOn: d.period?.reserveMovedOn ?? "",
    reserveAmount:
      d.period?.reserveAmount !== null && d.period?.reserveAmount !== undefined
        ? String(d.period.reserveAmount)
        : String(d.row.annualReserve),
    notes: d.period?.notes ?? "",
  })
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await apiCall("PUT", `/api/admin/finance/periods/${d.month}`, {
        dueDate: f.dueDate || null,
        reserveMovedOn: f.reserveMovedOn || null,
        reserveAmount: f.reserveMovedOn ? Number(f.reserveAmount || 0) : null,
        notes: f.notes.trim() || null,
      })
      toast.success("Guardado")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel>
      <PanelHeader
        title="Vencimiento y reserva"
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1.5" disabled={busy} onClick={save}>
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}{" "}
            Guardar
          </Button>
        }
      />
      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Vencimiento del PDT 621</Label>
          <Input
            type="date"
            value={f.dueDate}
            onChange={(e) => setF({ ...f, dueDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reserva separada el</Label>
          <Input
            type="date"
            value={f.reserveMovedOn}
            onChange={(e) => setF({ ...f, reserveMovedOn: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Monto separado (S/)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={f.reserveAmount}
            onChange={(e) => setF({ ...f, reserveAmount: e.target.value })}
          />
          <p className="text-[11px] text-ent-fg-3">
            El 10 % del mes es {soles(d.row.annualReserve)}.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notas</Label>
          <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
      </div>
      <p className="px-3 pb-3 text-[12px] text-ent-fg-3">
        El vencimiento viene del cronograma de SUNAT por el último dígito del RUC (5 para CUIK
        E.I.R.L.); cámbialo solo si SUNAT lo modifica. La reserva es el 10 % que se mueve a la
        cuenta para la renta anual: márcala el día que la separas.
      </p>
    </Panel>
  )
}

function SummaryPanel({ d }: { d: Detail }) {
  const hasImport = !!d.import
  return (
    <Panel>
      <PanelHeader title="Conciliación por concepto" />
      {!hasImport && (
        <Notice tone="info" className="m-3">
          Descarga la plantilla, pásala al contador y vuelve a subirla con lo que declaró: aquí
          verás las diferencias.
        </Notice>
      )}
      <DataTable>
        <thead>
          <tr>
            <Th>Concepto</Th>
            <Th align="right">Panel</Th>
            <Th align="right">Contador</Th>
            <Th align="right">Diferencia</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {d.summary.map((r) => (
            <Tr key={r.code}>
              <Td>{r.label}</Td>
              <Td align="right">{soles(r.panel)}</Td>
              <Td align="right">{r.declared === null ? "—" : soles(r.declared)}</Td>
              <Td align="right">{r.diff === null ? "—" : soles(r.diff)}</Td>
              <Td>
                {r.status === "missing" ? (
                  <StatusChip tone="mute">{hasImport ? "Sin dato" : "—"}</StatusChip>
                ) : r.status === "ok" ? (
                  <StatusChip tone="ok">Coincide</StatusChip>
                ) : (
                  <StatusChip tone="bad">Diferencia</StatusChip>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
      <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-t border-ent-line">
        Hasta S/ 1 de diferencia es redondeo: el PDT 621 se declara en soles enteros.
      </p>
    </Panel>
  )
}

const LINE_STATUS: Record<
  LineMatch["status"],
  { label: string; tone: "ok" | "bad" | "warn" | "info" }
> = {
  ok: { label: "Coincide", tone: "ok" },
  amount: { label: "Monto distinto", tone: "bad" },
  only_panel: { label: "Solo en el panel", tone: "warn" },
  only_accountant: { label: "Solo en el contador", tone: "info" },
  duplicate: { label: "Repetido en el contador", tone: "bad" },
}

function LinesPanel({ d }: { d: Detail }) {
  const [showAll, setShowAll] = useState(false)
  if (!d.import) return null
  const issues = d.lines.filter((l) => l.status !== "ok")
  const rows = showAll ? d.lines : issues
  return (
    <Panel>
      <PanelHeader
        title={`Conciliación por comprobante (${d.lines.length - issues.length} de ${d.lines.length} coinciden)`}
        actions={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[12px]"
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll ? "Ver solo diferencias" : "Ver todos"}
          </Button>
        }
      />
      {rows.length === 0 ? (
        <PanelMessage className="py-8">Todos los comprobantes coinciden.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Libro</Th>
              <Th>Comprobante</Th>
              <Th>Contraparte</Th>
              <Th align="right">Total panel</Th>
              <Th align="right">Total contador</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const l = r.panel ?? r.accountant
              const st = LINE_STATUS[r.status]
              return (
                <Tr key={r.key}>
                  <Td>{l?.book === "V" ? "Ventas" : "Compras"}</Td>
                  <Td className="whitespace-nowrap">
                    {l ? `${l.docType} · ${l.serie}-${l.numero}` : "—"}
                  </Td>
                  <Td>
                    {l?.counterpartyName ?? "—"}
                    {l?.counterpartyDoc ? (
                      <span className="block text-[11px] text-ent-fg-3">{l.counterpartyDoc}</span>
                    ) : null}
                  </Td>
                  <Td align="right">{r.panel ? soles(r.panel.total) : "—"}</Td>
                  <Td align="right">{r.accountant ? soles(r.accountant.total) : "—"}</Td>
                  <Td>
                    <StatusChip tone={st.tone}>{st.label}</StatusChip>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </DataTable>
      )}
      <div className="px-3 py-2 border-t border-ent-line">
        <FieldList
          rows={[
            {
              label: "Qué hacer",
              value:
                "«Solo en el contador»: regístralo en Ventas o Compras. «Solo en el panel»: confirma con el contador si va en este mes. «Monto distinto»: corrige el que esté mal.",
            },
          ]}
        />
      </div>
    </Panel>
  )
}
