"use client"

import { Loader2, Plus, Trash2, Upload } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { ImpactReport } from "@/components/impact/impact-report"
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
import { fmtDay } from "@/lib/loyalty/impact/format"
import type { ImportPreview, ImportRow, ReportView } from "@/lib/loyalty/impact/store"
import {
  type ColumnMapping,
  IMPACT_FIELD_LABELS,
  IMPACT_FIELDS,
  type ImpactField,
} from "@/lib/loyalty/impact/types"

type TenantOption = { id: string; name: string; status: string }

const STATUS: Record<string, { tone: "ok" | "info" | "warn" | "bad" | "mute"; label: string }> = {
  ready: { tone: "ok", label: "Listo" },
  processing: { tone: "info", label: "Procesando" },
  mapping: { tone: "warn", label: "Sin confirmar" },
  failed: { tone: "bad", label: "Falló" },
}

export function ImpactClient({ tenants }: { tenants: TenantOption[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "")
  const tenant = tenants.find((t) => t.id === tenantId) ?? null
  const [imports, setImports] = useState<ImportRow[] | null>(null)
  const [report, setReport] = useState<ReportView | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const reqRef = useRef(0)

  const loadImports = useCallback(async (): Promise<ImportRow[]> => {
    if (!tenantId) return []
    const id = ++reqRef.current
    setImports(null)
    try {
      const res = await fetch(`/api/admin/impact/imports?tenantId=${tenantId}`)
      const json = await res.json()
      if (id !== reqRef.current) return []
      const rows: ImportRow[] = json.success ? json.data : []
      setImports(rows)
      return rows
    } catch {
      if (id === reqRef.current) setImports([])
      return []
    }
  }, [tenantId])

  const openReport = useCallback(
    async (reportId: string) => {
      setLoadingReport(true)
      try {
        const res = await fetch(`/api/admin/impact/reports/${reportId}?tenantId=${tenantId}`)
        const json = await res.json()
        if (json.success) setReport(json.data)
        else toast.error(json.error ?? "No se pudo abrir el corte")
      } catch {
        toast.error("Error de conexión")
      } finally {
        setLoadingReport(false)
      }
    },
    [tenantId],
  )

  // New tenant: its list, and its latest corte open.
  useEffect(() => {
    setReport(null)
    void loadImports().then((rows) => {
      const latest = rows.find((r) => r.reportId)
      if (latest?.reportId) void openReport(latest.reportId)
    })
  }, [loadImports, openReport])

  async function removeImport(row: ImportRow) {
    if (
      !window.confirm(
        `¿Eliminar la carga "${row.fileName}" y su corte? Sus compras salen del análisis.`,
      )
    )
      return
    const res = await fetch(`/api/admin/impact/imports/${row.id}?tenantId=${tenantId}`, {
      method: "DELETE",
    })
    const json = await res.json()
    if (!json.success) {
      toast.error(json.error ?? "No se pudo eliminar")
      return
    }
    toast.success("Carga eliminada")
    if (report && imports?.find((r) => r.id === row.id)?.reportId === report.id) setReport(null)
    await loadImports()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "Loyalty", href: "/admin" }, { label: "Impacto" }]}
        title="Impacto"
        subtitle="Las ventas del comercio (DNI · fecha · monto) cruzadas con sus clientes y visitas en Cuik. Un corte por mes."
        actions={
          <div className="flex items-center gap-2">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="h-8 w-56 text-[12.5px]">
                <SelectValue placeholder="Comercio" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-[12.5px]"
              disabled={!tenantId}
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Nueva carga
            </Button>
          </div>
        }
      />

      {tenant && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          tenant={tenant}
          onDone={async (reportId) => {
            await loadImports()
            await openReport(reportId)
          }}
        />
      )}

      <Panel>
        <PanelHeader title={`Cargas de ${tenant?.name ?? "—"}`} />
        {imports === null ? (
          <PanelMessage>
            <Loader2 className="w-4 h-4 animate-spin" />
          </PanelMessage>
        ) : imports.length === 0 ? (
          <PanelMessage>
            <span>Todavía no hay cargas para este comercio.</span>
            <span>
              Pide al comercio su exportación de ventas (DNI, fecha y monto) y súbela aquí.
            </span>
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Archivo</Th>
                <Th>Período</Th>
                <Th align="right">Compras</Th>
                <Th align="right">Con DNI</Th>
                <Th>Estado</Th>
                <Th>Subida</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {imports.map((r) => (
                <Tr
                  key={r.id}
                  className={report?.id === r.reportId ? "bg-ent-accent-soft" : undefined}
                >
                  <Td className="font-medium text-ent-fg max-w-[260px] truncate">{r.fileName}</Td>
                  <Td>{r.periodFrom ? `${fmtDay(r.periodFrom)} – ${fmtDay(r.periodTo)}` : "—"}</Td>
                  <Td align="right">{r.ordersTotal.toLocaleString("es-PE")}</Td>
                  <Td align="right">
                    {r.ordersTotal
                      ? `${Math.round((100 * r.ordersWithDni) / r.ordersTotal)} %`
                      : "—"}
                  </Td>
                  <Td>
                    <StatusChip
                      tone={STATUS[r.status]?.tone ?? "mute"}
                      title={r.error ?? undefined}
                    >
                      {STATUS[r.status]?.label ?? r.status}
                    </StatusChip>
                  </Td>
                  <Td className="text-ent-fg-3">
                    {fmtDay(r.createdAt)}
                    {r.createdBy ? ` · ${r.createdBy}` : ""}
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      {r.reportId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[12px]"
                          onClick={() => void openReport(r.reportId as string)}
                        >
                          Ver corte
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-ent-fg-3 hover:text-red-600"
                        aria-label="Eliminar carga"
                        onClick={() => void removeImport(r)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {loadingReport && (
        <PanelMessage>
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      )}
      {report && !loadingReport && (
        <ImpactReport
          report={report}
          excelHref={`/api/admin/impact/reports/${report.id}?tenantId=${tenantId}&format=xlsx`}
          tenantName={tenant?.name ?? ""}
        />
      )}
    </div>
  )
}

// ── Upload + mapping dialog ─────────────────────────────────────────

function UploadDialog({
  open,
  onOpenChange,
  tenant,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant: TenantOption
  onDone: (reportId: string) => Promise<void>
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [retentionDays, setRetentionDays] = useState(90)
  const [excluded, setExcluded] = useState("")
  const [busy, setBusy] = useState<"upload" | "process" | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setMapping(null)
      setBusy(null)
    }
  }, [open])

  async function upload(file: File) {
    setBusy("upload")
    try {
      const fd = new FormData()
      fd.append("tenantId", tenant.id)
      fd.append("file", file)
      const res = await fetch("/api/admin/impact/imports", { method: "POST", body: fd })
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
    const missing = (["dni", "date", "amount"] as ImpactField[]).filter((f) => mapping[f] === null)
    if (missing.length) {
      toast.error(`Falta indicar: ${missing.map((f) => IMPACT_FIELD_LABELS[f]).join(", ")}`)
      return
    }
    setBusy("process")
    try {
      const res = await fetch(`/api/admin/impact/imports/${preview.importId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
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

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva carga · {tenant.name}</DialogTitle>
          <DialogDescription>
            Sube la exportación de ventas del comercio (.xlsx o .csv). Necesita al menos DNI, fecha
            y monto; con la referencia de la orden, las líneas de un mismo pedido se suman.
          </DialogDescription>
        </DialogHeader>

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

            <div className="space-y-2">
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
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Primeras filas</Label>
              <DataTable className="text-[11.5px]">
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => (
                      <Th key={`${i}-${h}`} className={used.has(i) ? "text-ent-accent" : undefined}>
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

            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-1">
                <Label htmlFor="retention" className="text-xs">
                  Ventana de retención (días)
                </Label>
                <Input
                  id="retention"
                  type="number"
                  min={7}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value) || 90)}
                />
                <p className="text-[11px] text-ent-fg-3">
                  90 para una veterinaria, 30 para una cafetería.
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
          </div>
        )}

        <DialogFooter>
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
