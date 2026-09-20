"use client"

import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

import { type Filters, FiltersBar, presetRange } from "./filters-bar"
import { InsightsPanel } from "./insights-panel"
import { KpiGrid } from "./kpi-grid"
import { PlatformFunnel } from "./platform-funnel"
import { TenantsTable } from "./tenants-table"
import { TrendChart } from "./trend-chart"
import { WalletCampaigns } from "./wallet-campaigns"

function toQuery(f: Filters): string {
  const p = new URLSearchParams({ from: f.from, to: f.to, status: f.status, program: f.program })
  if (f.planId) p.set("planId", f.planId)
  if (f.tenantIds.length > 0) p.set("tenantIds", f.tenantIds.join(","))
  if (f.includeInternal) p.set("includeInternal", "1")
  return p.toString()
}

export function MetricsDashboard() {
  const [filters, setFilters] = useState<Filters>({
    preset: "30d",
    ...presetRange("30d"),
    status: "all",
    program: "all",
    planId: null,
    tenantIds: [],
    includeInternal: false,
  })
  const [data, setData] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [focusIds, setFocusIds] = useState<string[]>([])
  const [minDate, setMinDate] = useState<Date | undefined>(undefined)
  const tableRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  const load = useCallback(async (f: Filters) => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/metrics?${toQuery(f)}`)
      const json = await res.json()
      if (id !== reqId.current) return // a newer request superseded this one
      if (!json.success) throw new Error(json.error ?? "error")
      setData(json.data)
    } catch (err) {
      if (id !== reqId.current) return
      setError(err instanceof Error ? err.message : "No se pudieron cargar las métricas")
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(filters)
  }, [filters, load])

  useEffect(() => {
    fetch("/api/admin/reports/first-visit")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.firstVisitDate) {
          const [y, m, d] = (j.data.firstVisitDate as string).split("-").map(Number)
          setMinDate(new Date(y, m - 1, d))
        }
      })
      .catch(() => {})
  }, [])

  async function exportXlsx() {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/metrics?${toQuery(filters)}&format=xlsx`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cuik-metricas-${filters.from}-a-${filters.to}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("No se pudo exportar")
    } finally {
      setExporting(false)
    }
  }

  function focusTenants(ids: string[]) {
    setFocusIds(ids)
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="space-y-5">
      <FiltersBar
        filters={filters}
        onChange={(f) => {
          setFocusIds([])
          setFilters(f)
        }}
        options={data?.options ?? null}
        minDate={minDate}
        loading={loading}
        onExport={exportXlsx}
        exporting={exporting}
        internalExcluded={data?.internalExcluded ?? 0}
        onExportDetail={() => {
          window.location.href = `/api/admin/reports/export?from=${filters.from}&to=${filters.to}`
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!data && loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : data ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <KpiGrid data={data} program={filters.program} />
          <InsightsPanel insights={data.insights} onFocusTenants={focusTenants} />
          <TrendChart data={data} />
          <div ref={tableRef}>
            <TenantsTable
              rows={data.tenants}
              highlightIds={focusIds}
              onClearHighlight={() => setFocusIds([])}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <PlatformFunnel funnel={data.funnel} />
            <WalletCampaigns wallet={data.wallet} campaigns={data.campaigns} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
