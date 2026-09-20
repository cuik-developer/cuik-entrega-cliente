"use client"

import { CalendarDays, Check, ChevronDown, Download, Loader2, X } from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

export type Preset = "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "custom"

export type Filters = {
  preset: Preset
  from: string
  to: string
  status: "all" | "active" | "trial"
  program: "all" | "stamps" | "points"
  planId: string | null
  tenantIds: string[]
  includeInternal: boolean
}

const TZ = "America/Lima"
export function ymd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ })
}
function todayLima(): Date {
  const [y, m, d] = ymd(new Date()).split("-").map(Number)
  return new Date(y, m - 1, d, 12)
}

export function presetRange(p: Preset): { from: string; to: string } {
  const t = todayLima()
  const end = new Date(t)
  const start = new Date(t)
  switch (p) {
    case "7d":
      start.setDate(start.getDate() - 6)
      break
    case "30d":
      start.setDate(start.getDate() - 29)
      break
    case "90d":
      start.setDate(start.getDate() - 89)
      break
    case "thisMonth":
      start.setDate(1)
      break
    case "lastMonth":
      start.setMonth(start.getMonth() - 1, 1)
      end.setDate(0)
      break
    default:
      break
  }
  const f = (d: Date) => d.toLocaleDateString("en-CA")
  return { from: f(start), to: f(end) }
}

const PRESETS: Array<{ v: Preset; label: string }> = [
  { v: "7d", label: "7 días" },
  { v: "30d", label: "30 días" },
  { v: "90d", label: "90 días" },
  { v: "thisMonth", label: "Este mes" },
  { v: "lastMonth", label: "Mes pasado" },
]

export function FiltersBar({
  filters,
  onChange,
  options,
  minDate,
  loading,
  onExport,
  exporting,
  onExportDetail,
  internalExcluded,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  options: PlatformMetrics["options"] | null
  minDate?: Date
  loading: boolean
  onExport: () => void
  exporting: boolean
  /** Old client-level workbook (one sheet per tenant, one row per visit). */
  onExportDetail: () => void
  internalExcluded: number
}) {
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const selectedTenants = new Set(filters.tenantIds)
  const activeCount =
    (filters.status !== "all" ? 1 : 0) +
    (filters.program !== "all" ? 1 : 0) +
    (filters.planId ? 1 : 0) +
    (filters.tenantIds.length > 0 ? 1 : 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="w-4 h-4 text-slate-400" />
        {PRESETS.map((p) => (
          <Button
            key={p.v}
            size="sm"
            variant={filters.preset === p.v ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => onChange({ ...filters, preset: p.v, ...presetRange(p.v) })}
          >
            {p.label}
          </Button>
        ))}
        <DateRangePicker
          value={customRange}
          onChange={(r) => {
            setCustomRange(r)
            if (r?.from && r.to) {
              onChange({ ...filters, preset: "custom", from: ymd(r.from), to: ymd(r.to) })
            }
          }}
          minDate={minDate}
          active={filters.preset === "custom"}
        />
        <span className="ml-auto text-xs text-slate-400 tabular-nums">
          {filters.from} → {filters.to} · comparado con el período anterior
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ ...filters, status: v as Filters["status"] })}
        >
          <SelectTrigger size="sm" className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Activos y demos</SelectItem>
            <SelectItem value="active">Solo activos</SelectItem>
            <SelectItem value="trial">Solo demos</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.program}
          onValueChange={(v) => onChange({ ...filters, program: v as Filters["program"] })}
        >
          <SelectTrigger size="sm" className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sellos y puntos</SelectItem>
            <SelectItem value="stamps">Solo sellos</SelectItem>
            <SelectItem value="points">Solo puntos</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.planId ?? "all"}
          onValueChange={(v) => onChange({ ...filters, planId: v === "all" ? null : v })}
        >
          <SelectTrigger size="sm" className="w-40 h-8 text-xs">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            {(options?.plans ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              {filters.tenantIds.length === 0
                ? "Todos los comercios"
                : `${filters.tenantIds.length} comercio${filters.tenantIds.length > 1 ? "s" : ""}`}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Comparar comercios</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(options?.tenants ?? []).map((t) => (
              <DropdownMenuCheckboxItem
                key={t.id}
                checked={selectedTenants.has(t.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(selectedTenants)
                  if (checked) next.add(t.id)
                  else next.delete(t.id)
                  onChange({ ...filters, tenantIds: [...next] })
                }}
                onSelect={(e) => e.preventDefault()}
              >
                {t.name}
              </DropdownMenuCheckboxItem>
            ))}
            {filters.tenantIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
                  onClick={() => onChange({ ...filters, tenantIds: [] })}
                >
                  Quitar selección
                </button>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-[#0e70db]"
            checked={filters.includeInternal}
            onChange={(e) => onChange({ ...filters, includeInternal: e.target.checked })}
          />
          Incluir demos internas
          {!filters.includeInternal && internalExcluded > 0 && (
            <span className="text-slate-400">
              ({internalExcluded} excluida{internalExcluded > 1 ? "s" : ""})
            </span>
          )}
        </label>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-500 gap-1"
            onClick={() =>
              onChange({ ...filters, status: "all", program: "all", planId: null, tenantIds: [] })
            }
          >
            <X className="w-3 h-3" /> Limpiar filtros
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={onExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Exportar con estos filtros
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-500"
            onClick={onExportDetail}
            title="Excel con una hoja por comercio y una fila por visita (nivel cliente)"
          >
            Detalle por cliente
          </Button>
        </div>
      </div>
      {activeCount > 0 && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <Check className="w-3 h-3" /> Todos los bloques de la página respetan estos filtros.
        </p>
      )}
    </div>
  )
}
