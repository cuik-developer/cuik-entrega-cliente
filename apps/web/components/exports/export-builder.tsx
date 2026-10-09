"use client"

import { Download, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  CLIENT_STATUS_OPTIONS,
  type ClientStatusFilter,
  columnsFor,
  DATASETS,
  type DatasetKey,
  datasetByKey,
  datasetsFor,
  type ProgramType,
} from "@/lib/exports/dataset-columns"
import { cn } from "@/lib/utils"

/** Local calendar date (the browser's), never UTC: after 19:00 in Lima UTC is already tomorrow. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return ymd(d)
}

export type ExportParams = {
  dataset: DatasetKey
  columns: string[]
  from?: string
  to?: string
  status: ClientStatusFilter
}

/**
 * Dataset + column picker + filters + download. Both the super-admin page
 * (with a tenant selector) and the merchant page use it; the caller only
 * says which URL serves the file.
 */
export function ExportBuilder({
  buildUrl,
  program,
  disabled,
  disabledHint,
  tone = "panel",
}: {
  buildUrl: (p: ExportParams) => string
  /** Active program of the tenant: hides the datasets and columns of the other one. */
  program?: ProgramType | null
  /** The caller has not selected a tenant yet, etc. */
  disabled?: boolean
  disabledHint?: string
  /** Visual tone: "ent" inside the super-admin shell, "panel" in the merchant panel. */
  tone?: "ent" | "panel"
}) {
  const [dataset, setDataset] = useState<DatasetKey>("clients")
  const def = datasetByKey(dataset) ?? DATASETS[0]
  const datasets = datasetsFor(program)
  const columns = useMemo(() => columnsFor(def, program), [def, program])
  // A stamps tenant has no points dataset: fall back to clients when it disappears.
  useEffect(() => {
    if (!datasets.some((d) => d.key === dataset)) setDataset("clients")
  }, [datasets, dataset])
  // When the program changes, forget ticks on columns that are no longer offered,
  // so they do not reappear ticked for a tenant without a known program.
  useEffect(() => {
    setSelected((s) => {
      const next = { ...s }
      for (const d of DATASETS) {
        const allowed = new Set(columnsFor(d, program).map((c) => c.key))
        next[d.key] = new Set([...s[d.key]].filter((k) => allowed.has(k)))
      }
      return next
    })
  }, [program])
  const [selected, setSelected] = useState<Record<DatasetKey, Set<string>>>(() => {
    const init = {} as Record<DatasetKey, Set<string>>
    for (const d of DATASETS) init[d.key] = new Set(d.columns.map((c) => c.key))
    return init
  })
  // Default range is set after mount: the server clock may be on another day.
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  useEffect(() => {
    setFrom(daysAgo(29))
    setTo(ymd(new Date()))
  }, [])
  const [status, setStatus] = useState<ClientStatusFilter>("all")
  const [busy, setBusy] = useState(false)

  // Hidden columns never count as picked, whatever was ticked before.
  const picked = useMemo(
    () => new Set([...selected[dataset]].filter((k) => columns.some((c) => c.key === k))),
    [selected, dataset, columns],
  )
  const groups = useMemo(() => {
    const out = new Map<string, typeof columns>()
    for (const c of columns) out.set(c.group, [...(out.get(c.group) ?? []), c])
    return [...out.entries()]
  }, [columns])

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s[dataset])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...s, [dataset]: next }
    })
  }
  function setAll(on: boolean) {
    setSelected((s) => ({
      ...s,
      [dataset]: new Set(on ? columns.map((c) => c.key) : []),
    }))
  }

  const rangeError =
    def.dated && (!from || !to)
      ? "Elige las fechas"
      : def.dated && from > to
        ? "La fecha inicial es posterior a la final"
        : def.dated && (Date.parse(to) - Date.parse(from)) / 86_400_000 > 366
          ? "Máximo un año por archivo"
          : null
  const canDownload = !disabled && !busy && picked.size > 0 && !rangeError

  async function download() {
    if (!canDownload) return
    setBusy(true)
    try {
      const url = buildUrl({
        dataset,
        // Keep the dataset's column order, not the click order.
        columns: columns.map((c) => c.key).filter((k) => picked.has(k)),
        from: def.dated ? from : undefined,
        to: def.dated ? to : undefined,
        status,
      })
      const res = await fetch(url)
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        toast.error(json?.error ?? "No se pudo generar el archivo")
        return
      }
      const blob = await res.blob()
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        `${dataset}.xlsx`
      const rows = res.headers.get("X-Row-Count")
      const href = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = href
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(href)
      toast.success(
        rows ? `Archivo listo: ${rows} ${rows === "1" ? "fila" : "filas"}` : "Archivo listo",
      )
    } catch {
      toast.error("Error de conexión al generar el archivo")
    } finally {
      setBusy(false)
    }
  }

  const ent = tone === "ent"
  const panel = ent
    ? "bg-ent-panel border border-ent-line rounded-[4px]"
    : "bg-card border border-border rounded-xl"
  const sectionTitle = ent
    ? "text-[11px] uppercase tracking-[0.05em] text-ent-fg-3"
    : "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
  const input = ent
    ? "h-7 px-2 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent"
    : "h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="space-y-3">
      {/* 1. Dataset */}
      <div className={cn(panel, "p-3 sm:p-4 space-y-2")}>
        <div className={sectionTitle}>1. Qué datos</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {datasets.map((d) => {
            const on = d.key === dataset
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDataset(d.key)}
                aria-pressed={on}
                className={cn(
                  "text-left rounded-[4px] border px-3 py-2 transition-colors",
                  ent
                    ? on
                      ? "border-ent-accent bg-ent-accent-soft"
                      : "border-ent-line hover:bg-ent-panel-2"
                    : on
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted",
                )}
              >
                <div className={cn("text-[13px] font-semibold", ent ? "text-ent-fg" : "")}>
                  {d.label}
                </div>
                <div className={cn("text-[12px]", ent ? "text-ent-fg-3" : "text-muted-foreground")}>
                  {d.description}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Filters */}
      <div className={cn(panel, "p-3 sm:p-4 space-y-2")}>
        <div className={sectionTitle}>2. Filtros</div>
        <div className="flex flex-wrap items-end gap-3">
          {def.dated ? (
            <>
              <label className="grid gap-1 text-[12px]">
                <span className={ent ? "text-ent-fg-3" : "text-muted-foreground"}>Desde</span>
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className={input}
                />
              </label>
              <label className="grid gap-1 text-[12px]">
                <span className={ent ? "text-ent-fg-3" : "text-muted-foreground"}>Hasta</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                  className={input}
                />
              </label>
              <div className="flex gap-1">
                {[
                  ["7 días", 6],
                  ["30 días", 29],
                  ["90 días", 89],
                  ["Este año", -1],
                ].map(([label, days]) => (
                  <Button
                    key={String(label)}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ent ? "h-7 text-[12px]" : "h-9 text-xs"}
                    onClick={() => {
                      const now = new Date()
                      setTo(ymd(now))
                      setFrom(days === -1 ? `${now.getFullYear()}-01-01` : daysAgo(Number(days)))
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <label className="grid gap-1 text-[12px]">
              <span className={ent ? "text-ent-fg-3" : "text-muted-foreground"}>
                Estado del cliente
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ClientStatusFilter)}
                className={cn(input, "pr-6")}
              >
                {CLIENT_STATUS_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {rangeError && <p className="text-[12px] text-red-600">{rangeError}</p>}
      </div>

      {/* 3. Columns */}
      <div className={cn(panel, "p-3 sm:p-4 space-y-2")}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className={sectionTitle}>
            3. Columnas · {picked.size} de {columns.length}
          </div>
          <div className="flex gap-3 text-[12px]">
            <button
              type="button"
              onClick={() => setAll(true)}
              className={ent ? "text-ent-accent hover:underline" : "text-primary hover:underline"}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className={ent ? "text-ent-accent hover:underline" : "text-primary hover:underline"}
            >
              Ninguna
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {groups.map(([group, cols]) => (
            <div key={group} className="space-y-1">
              <div
                className={cn(
                  "text-[12px] font-semibold",
                  ent ? "text-ent-fg-2" : "text-foreground",
                )}
              >
                {group}
              </div>
              {cols.map((c) => (
                <label
                  key={c.key}
                  className={cn(
                    "flex items-center gap-2 text-[12.5px] cursor-pointer py-0.5",
                    ent ? "text-ent-fg" : "",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(c.key)}
                    onChange={() => toggle(c.key)}
                    className="h-3.5 w-3.5 accent-[#0b5fc0]"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Download */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          onClick={download}
          disabled={!canDownload}
          className={ent ? "h-8 text-[12.5px] gap-1.5" : "gap-2"}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Descargar Excel
        </Button>
        <span className={cn("text-[12px]", ent ? "text-ent-fg-3" : "text-muted-foreground")}>
          {disabled && disabledHint
            ? disabledHint
            : picked.size === 0
              ? "Elige al menos una columna."
              : `${def.label} · ${picked.size} columnas${def.dated ? ` · del ${from} al ${to}` : ""}`}
        </span>
      </div>
    </div>
  )
}
