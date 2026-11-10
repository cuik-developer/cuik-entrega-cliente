"use client"

import { Loader2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DataTable, Notice, Td, Th, Tr } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

const REQUIRED: ImpactField[] = ["dni", "date", "amount"]

/**
 * Upload a sales file and confirm its columns, then compute the corte. The
 * same dialog serves the super-admin (`api.base` = /api/admin/impact with the
 * tenant id) and the merchant panel (`/api/<slug>/impact`, no tenant id).
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
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [retentionDays, setRetentionDays] = useState(90)
  const [excluded, setExcluded] = useState("")
  const [busy, setBusy] = useState<"upload" | "process" | null>(null)
  const [editColumns, setEditColumns] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setMapping(null)
      setBusy(null)
      setEditColumns(false)
    }
  }, [open])

  async function upload(file: File) {
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
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(null)
    }
  }

  async function process() {
    if (!preview || !mapping) return
    const missing = REQUIRED.filter((f) => mapping[f] === null)
    if (missing.length) {
      toast.error(`Falta indicar: ${missing.map((f) => IMPACT_FIELD_LABELS[f]).join(", ")}`)
      return
    }
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
  const requiredMissing = REQUIRED.filter(
    (f) => mapping?.[f] === null || mapping?.[f] === undefined,
  )
  // Columns are usually detected; the editor opens by itself only when something required is missing.
  const showColumns = editColumns || requiredMissing.length > 0
  const excludedCount = excluded.split(/[\s,;]+/).filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl max-h-[calc(100dvh-2rem)] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-ent-line">
          <DialogTitle>Nueva carga · {tenantName}</DialogTitle>
          <DialogDescription>
            Sube la exportación de ventas del comercio (.xlsx o .csv). Necesita al menos DNI, fecha
            y monto; con la referencia de la orden, las líneas de un mismo pedido se suman.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!preview ? (
            <div className="space-y-3">
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
              <Button
                type="button"
                variant="outline"
                className="w-full h-24 gap-2 border-dashed"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
              >
                {busy === "upload" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {busy === "upload"
                  ? "Leyendo el archivo…"
                  : "Elegir archivo (.xlsx o .csv, máximo 40 MB)"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Notice tone="info">
                {preview.fileName}: {preview.rowsTotal.toLocaleString("es-PE")} filas.{" "}
                {preview.minimumPurchase !== null
                  ? `El programa cuenta compras desde S/ ${preview.minimumPurchase}.`
                  : "El programa cuenta toda compra (sin mínimo o cashback)."}
              </Notice>

              {!showColumns ? (
                <div className="rounded-md border border-ent-line px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="text-[12.5px] font-medium text-ent-fg">Columnas detectadas</span>
                  {REQUIRED.map((f) => (
                    <span key={f} className="text-[12.5px] text-ent-fg-2">
                      {IMPACT_FIELD_LABELS[f]}:{" "}
                      <span className="text-ent-fg">{preview.headers[mapping?.[f] as number]}</span>
                    </span>
                  ))}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 ml-auto text-[12.5px]"
                    onClick={() => setEditColumns(true)}
                  >
                    Revisar columnas
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {requiredMissing.length > 0 && (
                    <Notice tone="warn">
                      No encontramos la columna de{" "}
                      {requiredMissing.map((f) => IMPACT_FIELD_LABELS[f]).join(", ")}. Elígela en la
                      lista.
                    </Notice>
                  )}
                  <Label>Columnas</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {IMPACT_FIELDS.map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="w-44 shrink-0 text-[12.5px] text-ent-fg-2">
                          {IMPACT_FIELD_LABELS[field]}
                          {["dni", "date", "amount"].includes(field) && (
                            <span className="text-red-600"> *</span>
                          )}
                        </span>
                        <Select
                          value={
                            mapping?.[field] === null || mapping?.[field] === undefined
                              ? "none"
                              : String(mapping[field])
                          }
                          onValueChange={(v) =>
                            setMapping((m) =>
                              m ? { ...m, [field]: v === "none" ? null : Number(v) } : m,
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-[12.5px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— No está en el archivo —</SelectItem>
                            {preview.headers.map((h, i) => (
                              <SelectItem
                                key={`${i}-${h}`}
                                value={String(i)}
                                disabled={used.has(i) && mapping?.[field] !== i}
                              >
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Primeras filas</Label>
                    <div className="overflow-x-auto rounded-md border border-ent-line">
                      <DataTable className="text-[11.5px]">
                        <thead>
                          <tr>
                            {preview.headers.map((h, i) => (
                              <Th
                                key={`${i}-${h}`}
                                className={used.has(i) ? "text-ent-accent" : undefined}
                              >
                                {h}
                              </Th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sample.map((row, ri) => (
                            <Tr key={`r${ri}`}>
                              {preview.headers.map((_, ci) => (
                                <Td key={`c${ci}`} className="max-w-[180px] truncate h-7">
                                  {row[ci] == null ? "" : String(row[ci])}
                                </Td>
                              ))}
                            </Tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </div>
                  </div>
                </div>
              )}

              <details className="group rounded-md border border-ent-line">
                <summary className="cursor-pointer select-none px-3 py-2.5 text-[12.5px] text-ent-fg-2 flex items-center gap-2">
                  <span className="font-medium text-ent-fg">Ajustes del cálculo</span>
                  <span>
                    Cliente que vuelve en {retentionDays} días
                    {excludedCount > 0 ? ` · ${excludedCount} DNI excluidos` : ""}
                  </span>
                  <span className="ml-auto text-ent-accent group-open:hidden">Cambiar</span>
                </summary>
                <div className="grid gap-4 px-3 pb-3 pt-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="retention" className="text-xs">
                      ¿En cuántos días debería volver un cliente?
                    </Label>
                    <Input
                      id="retention"
                      type="number"
                      min={7}
                      max={365}
                      className="w-28"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value) || 90)}
                    />
                    <p className="text-[11px] text-ent-fg-3 leading-snug">
                      Un cliente cuenta como “retenido” si vuelve a comprar dentro de estos días
                      después de su última compra del mes. Usa lo normal de tu rubro: 90 para una
                      veterinaria o pet shop, 30 para una cafetería.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="excluded" className="text-xs">
                      DNI excluidos (personal que usa su DNI en caja)
                    </Label>
                    <Textarea
                      id="excluded"
                      rows={2}
                      value={excluded}
                      placeholder="Uno por línea. Los compradores casi diarios se detectan solos."
                      onChange={(e) => setExcluded(e.target.value)}
                    />
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-ent-line">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            Cancelar
          </Button>
          {preview && (
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
