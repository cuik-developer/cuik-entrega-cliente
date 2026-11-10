"use client"

import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DataTable, Notice, Td, Th, Tr } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ImportPreview } from "@/lib/loyalty/impact/store"
import {
  type ColumnMapping,
  IMPACT_FIELD_LABELS,
  IMPACT_FIELDS,
  type ImpactField,
} from "@/lib/loyalty/impact/types"
import { cn } from "@/lib/utils"

const REQUIRED: ImpactField[] = ["dni", "date", "amount"]
const OPTIONAL = IMPACT_FIELDS.filter((f) => !REQUIRED.includes(f))

const FIELD_HINTS: Partial<Record<ImpactField, string>> = {
  dni: "Para reconocer a tus clientes de Cuik",
  date: "Día de la compra",
  amount: "Total pagado (con o sin decimales)",
  orderRef: "Suma las líneas de un mismo pedido",
  idType: "Descarta RUC, CE y pasaportes",
}

const STEPS = ["Archivo", "Columnas", "Revisar y procesar"] as const
type Step = 0 | 1 | 2

/**
 * Bulk upload of a sales file in three steps, the way ERP bulk loads work:
 * pick the file, confirm which column is which, review and compute the corte.
 * The same dialog serves the super-admin (`api.base` = /api/admin/impact with
 * the tenant id) and the merchant panel (`/api/<slug>/impact`, no tenant id).
 */
export function UploadDialog({
  open,
  onOpenChange,
  tenantName,
  api,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantName: string
  api: { base: string; tenantId?: string }
  onDone: (reportId: string) => Promise<void>
}) {
  const [step, setStep] = useState<Step>(0)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [retentionDays, setRetentionDays] = useState(90)
  const [excluded, setExcluded] = useState("")
  const [busy, setBusy] = useState<"upload" | "process" | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showRows, setShowRows] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setStep(0)
      setPreview(null)
      setMapping(null)
      setBusy(null)
      setDragging(false)
      setShowRows(false)
    }
  }, [open])

  async function upload(file: File) {
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast.error("El archivo debe ser .xlsx o .csv")
      return
    }
    setBusy("upload")
    try {
      const fd = new FormData()
      if (api.tenantId) fd.append("tenantId", api.tenantId)
      fd.append("file", file)
      const res = await fetch(`${api.base}/imports`, { method: "POST", body: fd })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo leer el archivo")
        return
      }
      const p: ImportPreview = json.data
      setPreview(p)
      setMapping(p.mapping)
      setRetentionDays(p.options.retentionDays)
      setExcluded(p.options.excludedDnis.join("\n"))
      setStep(1)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(null)
    }
  }

  async function process() {
    if (!preview || !mapping) return
    setBusy("process")
    try {
      const res = await fetch(`${api.base}/imports/${preview.importId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: api.tenantId,
          headers: preview.headers,
          mapping,
          options: {
            retentionDays,
            excludedDnis: excluded
              .split(/[\s,;]+/)
              .map((d) => d.trim())
              .filter(Boolean),
          },
        }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo procesar")
        return
      }
      toast.success("Corte calculado")
      onOpenChange(false)
      await onDone(json.data.reportId)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(null)
    }
  }

  const used = new Set(Object.values(mapping ?? {}).filter((v): v is number => v !== null))
  const requiredMissing = REQUIRED.filter((f) => mapping?.[f] == null)
  const excludedCount = excluded.split(/[\s,;]+/).filter(Boolean).length
  const optionalMapped = OPTIONAL.filter((f) => mapping?.[f] != null).length

  /** First non-empty value of a column in the sample, to show what it holds. */
  function example(col: number | null | undefined): string {
    if (col == null || !preview) return ""
    for (const row of preview.sample) {
      const v = row[col]
      if (v != null && String(v).trim() !== "") return String(v)
    }
    return ""
  }

  function setField(field: ImpactField, v: string) {
    setMapping((m) => (m ? { ...m, [field]: v === "none" ? null : Number(v) } : m))
  }

  function fieldRow(field: ImpactField) {
    const col = mapping?.[field]
    const required = REQUIRED.includes(field)
    const ok = col != null
    return (
      <div
        key={field}
        className="grid grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-3 px-3 py-2 border-t border-ent-line first:border-t-0"
      >
        <span className="flex justify-center">
          {ok ? (
            <Check className="w-4 h-4 text-ent-ok" aria-label="Asignada" />
          ) : required ? (
            <AlertTriangle className="w-4 h-4 text-ent-warn" aria-label="Falta" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-ent-line" />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-ent-fg truncate">
            {IMPACT_FIELD_LABELS[field]}
            {required && <span className="text-red-600"> *</span>}
          </div>
          {FIELD_HINTS[field] && (
            <div className="text-[11px] text-ent-fg-3 truncate">{FIELD_HINTS[field]}</div>
          )}
        </div>
        <Select
          value={col == null ? "none" : String(col)}
          onValueChange={(v) => setField(field, v)}
        >
          <SelectTrigger
            className={cn(
              "h-8 w-full min-w-0 text-[12.5px] *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate",
              required && !ok && "border-ent-warn",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="none">— No está en el archivo —</SelectItem>
            {preview?.headers.map((h, i) => (
              <SelectItem
                // biome-ignore lint/suspicious/noArrayIndexKey: headers can repeat; the index is the column
                key={i}
                value={String(i)}
                disabled={used.has(i) && col !== i}
              >
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-w-0 text-[12px] text-ent-fg-3 truncate" title={example(col)}>
          {ok ? example(col) || <span className="italic">vacío en las primeras filas</span> : "—"}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className="sm:max-w-4xl w-full h-[min(760px,calc(100dvh-2rem))] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-ent-line space-y-3">
          <div>
            <DialogTitle>Carga de ventas · {tenantName}</DialogTitle>
            <DialogDescription className="mt-1">
              Exportación de ventas de tu sistema de caja, en Excel (.xlsx) o CSV.
            </DialogDescription>
          </div>
          <ol className="flex items-center gap-2 text-[12.5px]">
            {STEPS.map((label, i) => {
              const state = i < step ? "done" : i === step ? "current" : "todo"
              return (
                <li key={label} className="flex items-center gap-2 min-w-0">
                  {i > 0 && <span className="w-6 sm:w-10 h-px bg-ent-line" />}
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                      state === "done" && "bg-ent-accent text-white",
                      state === "current" && "border-2 border-ent-accent text-ent-accent",
                      state === "todo" && "border border-ent-line text-ent-fg-3",
                    )}
                  >
                    {state === "done" ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      state === "current" ? "text-ent-fg font-medium" : "text-ent-fg-3",
                    )}
                  >
                    {label}
                  </span>
                </li>
              )
            })}
          </ol>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] h-full">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void upload(f)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f && busy === null) void upload(f)
                }}
                className={cn(
                  "flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-colors",
                  dragging
                    ? "border-ent-accent bg-ent-accent-soft"
                    : "border-ent-line hover:border-ent-accent/60",
                )}
              >
                {busy === "upload" ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-ent-accent" />
                    <span className="text-[14px] text-ent-fg">Leyendo el archivo…</span>
                    <span className="text-[12px] text-ent-fg-3">
                      Con muchas filas puede tardar unos segundos.
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-ent-fg-3" />
                    <span className="text-[14px] text-ent-fg">
                      Arrastra el archivo aquí o <span className="text-ent-accent">elígelo</span>
                    </span>
                    <span className="text-[12px] text-ent-fg-3">.xlsx o .csv · hasta 40 MB</span>
                  </>
                )}
              </button>

              <div className="space-y-4 text-[12.5px]">
                <div>
                  <div className="font-medium text-ent-fg mb-1.5">Columnas necesarias</div>
                  <ul className="space-y-1 text-ent-fg-2">
                    {REQUIRED.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="w-3.5 h-3.5 mt-0.5 text-ent-accent shrink-0" />
                        {IMPACT_FIELD_LABELS[f]}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-ent-fg mb-1.5">Suman, si las tienes</div>
                  <p className="text-ent-fg-3 leading-relaxed">
                    {OPTIONAL.map((f) => IMPACT_FIELD_LABELS[f]).join(" · ")}
                  </p>
                </div>
                <div className="rounded-md bg-ent-panel-2 px-3 py-2.5 text-ent-fg-3 leading-relaxed">
                  <FileSpreadsheet className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                  Sube el archivo tal como lo exporta tu sistema (Odoo, Excel, etc.). Las columnas
                  se reconocen solas; en el siguiente paso las confirmas.
                </div>
              </div>
            </div>
          )}

          {step === 1 && preview && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                <FileSpreadsheet className="w-4 h-4 text-ent-fg-3" />
                <span className="font-medium text-ent-fg truncate max-w-[420px]">
                  {preview.fileName}
                </span>
                <span className="text-ent-fg-3">
                  {preview.rowsTotal.toLocaleString("es-PE")} filas · {preview.headers.length}{" "}
                  columnas
                </span>
              </div>

              {requiredMissing.length > 0 ? (
                <Notice tone="warn">
                  Falta indicar {requiredMissing.map((f) => IMPACT_FIELD_LABELS[f]).join(", ")}.
                  Elige la columna en la lista.
                </Notice>
              ) : (
                <Notice tone="ok">
                  Reconocimos las columnas necesarias. Revisa que el ejemplo de cada una tenga
                  sentido y sigue.
                </Notice>
              )}

              <div className="rounded-md border border-ent-line">
                <div className="grid grid-cols-[20px_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-3 px-3 py-2 bg-ent-panel-2 text-[11px] uppercase tracking-wide text-ent-fg-3 rounded-t-md">
                  <span />
                  <span>Dato</span>
                  <span>Columna de tu archivo</span>
                  <span>Ejemplo</span>
                </div>
                {REQUIRED.map(fieldRow)}
              </div>

              <div className="rounded-md border border-ent-line">
                <div className="px-3 py-2 bg-ent-panel-2 text-[11px] uppercase tracking-wide text-ent-fg-3 rounded-t-md">
                  Opcionales · {optionalMapped} de {OPTIONAL.length} asignadas
                </div>
                {OPTIONAL.map(fieldRow)}
              </div>

              <div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-[12.5px]"
                  onClick={() => setShowRows((s) => !s)}
                >
                  {showRows ? "Ocultar las primeras filas" : "Ver las primeras filas del archivo"}
                </Button>
                {showRows && (
                  <div className="mt-2 max-w-full overflow-x-auto rounded-md border border-ent-line">
                    <DataTable className="text-[11.5px]">
                      <thead>
                        <tr>
                          {preview.headers.map((h, i) => (
                            <Th
                              // biome-ignore lint/suspicious/noArrayIndexKey: the index is the column
                              key={i}
                              className={cn("whitespace-nowrap", used.has(i) && "text-ent-accent")}
                            >
                              {h}
                            </Th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((row, ri) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: sample rows have no id
                          <Tr key={ri}>
                            {preview.headers.map((_, ci) => (
                              <Td
                                // biome-ignore lint/suspicious/noArrayIndexKey: the index is the column
                                key={ci}
                                className="max-w-[180px] truncate h-7 whitespace-nowrap"
                              >
                                {row[ci] == null ? "" : String(row[ci])}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && preview && mapping && (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <div className="text-[12.5px] font-medium text-ent-fg">Resumen de la carga</div>
                <dl className="rounded-md border border-ent-line divide-y divide-ent-line text-[12.5px]">
                  {[
                    ["Archivo", preview.fileName],
                    ["Filas", preview.rowsTotal.toLocaleString("es-PE")],
                    ...REQUIRED.map((f) => [
                      IMPACT_FIELD_LABELS[f],
                      preview.headers[mapping[f] as number],
                    ]),
                    ["Opcionales asignadas", `${optionalMapped} de ${OPTIONAL.length}`],
                    [
                      "Compras que cuenta el programa",
                      preview.minimumPurchase !== null
                        ? `Desde S/ ${preview.minimumPurchase}`
                        : "Todas (sin mínimo o cashback)",
                    ],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 px-3 py-2"
                    >
                      <dt className="text-ent-fg-3">{k}</dt>
                      <dd className="text-ent-fg truncate" title={v}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11.5px] text-ent-fg-3 leading-relaxed">
                  Si ya habías cargado ventas de estas mismas fechas, se reemplazan: subir el mismo
                  mes dos veces no duplica nada.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="retention" className="text-[12.5px]">
                    ¿En cuántos días debería volver un cliente?
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="retention"
                      type="number"
                      min={7}
                      max={365}
                      className="w-24"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value) || 90)}
                    />
                    <span className="text-[12.5px] text-ent-fg-3">días</span>
                  </div>
                  <p className="text-[11.5px] text-ent-fg-3 leading-relaxed">
                    Un cliente cuenta como “retenido” si vuelve a comprar dentro de estos días
                    después de su última compra del mes. Usa lo normal de tu rubro: 90 para una
                    veterinaria o pet shop, 30 para una cafetería.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="excluded" className="text-[12.5px]">
                    DNI del personal que compra con su DNI{" "}
                    <span className="font-normal text-ent-fg-3">
                      (opcional{excludedCount > 0 ? ` · ${excludedCount}` : ""})
                    </span>
                  </Label>
                  <Textarea
                    id="excluded"
                    rows={4}
                    value={excluded}
                    placeholder="Uno por línea. Quien compra casi todos los días se detecta solo."
                    onChange={(e) => setExcluded(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-3.5 border-t border-ent-line">
          <span className="text-[12px] text-ent-fg-3 hidden sm:block">
            Paso {step + 1} de {STEPS.length}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {step === 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy !== null}
              >
                Cancelar
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => (s - 1) as Step)}
                disabled={busy !== null}
              >
                Atrás
              </Button>
            )}
            {step === 1 && (
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={requiredMissing.length > 0}
              >
                Siguiente
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={() => void process()} disabled={busy !== null}>
                {busy === "process" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Calculando…
                  </>
                ) : (
                  "Procesar y calcular el corte"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
