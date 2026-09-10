"use client"

import type {
  AnalyticsSummary,
  FunnelData,
  HeatmapData,
  SegmentsData,
} from "@cuik/shared/types/analytics"
import { CalendarDays, Download, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { useTenant } from "@/hooks/use-tenant"

import { FunnelChart } from "./_components/funnel-chart"
import { KpiCards } from "./_components/kpi-cards"
import type { LocationOption } from "./_components/location-select"
import { ALL_LOCATIONS, LocationSelect } from "./_components/location-select"
import type { RetentionRow } from "./_components/retention-heatmap"
import { RetentionHeatmap } from "./_components/retention-heatmap"
import { SegmentsChart } from "./_components/segments-chart"
import type { TopClientRow } from "./_components/top-clients-table"
import { TopClientsTable } from "./_components/top-clients-table"
import type { VisitsChartRow } from "./_components/visits-chart"
import { VisitsChart } from "./_components/visits-chart"
import { VisitsHeatmap } from "./_components/visits-heatmap"
import type { WalletDistribution } from "./_components/wallet-distribution-chart"
import { WalletDistributionChart } from "./_components/wallet-distribution-chart"

type Period = "day" | "week" | "month"

const RANGE_OPTIONS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
] as const

// "YYYY-MM-DD" of a Date as seen in the tenant's timezone — the API buckets by
// tenant-local day, so the range must be expressed the same way.
function toYMD(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz })
}

function getDateRange(days: number, tz: string) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: toYMD(from, tz), to: toYMD(to, tz) }
}

const EMPTY_HEATMAP: HeatmapData = { cells: [], totalVisits: 0 }
const EMPTY_FUNNEL: FunnelData = { steps: [] }
const EMPTY_SEGMENTS: SegmentsData = { segments: [], total: 0 }

const EMPTY_SUMMARY: AnalyticsSummary = {
  totalVisits: 0,
  uniqueClients: 0,
  newClients: 0,
  rewardsRedeemed: 0,
  redemptionRate: 0,
  avgVisitsPerClient: 0,
  topClients: [],
}

export default function AnaliticaPage() {
  const {
    tenantSlug,
    timezone: tenantTz,
    isLoading: tenantLoading,
    error: tenantError,
  } = useTenant()

  const [rangeDays, setRangeDays] = useState<number | "custom">(30)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const [minDate, setMinDate] = useState<Date | undefined>(undefined)
  const [period, setPeriod] = useState<Period>("day")
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationId, setLocationId] = useState<string>(ALL_LOCATIONS)

  const [visits, setVisits] = useState<VisitsChartRow[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY)
  const [topClients, setTopClients] = useState<TopClientRow[]>([])

  const [walletDist, setWalletDist] = useState<WalletDistribution>({
    apple: 0,
    google: 0,
    none: 0,
  })
  const [heatmap, setHeatmap] = useState<HeatmapData>(EMPTY_HEATMAP)
  const [funnel, setFunnel] = useState<FunnelData>(EMPTY_FUNNEL)
  const [segments, setSegments] = useState<SegmentsData>(EMPTY_SEGMENTS)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const currentRange =
    rangeDays === "custom" && customRange?.from && customRange.to
      ? { from: toYMD(customRange.from, tenantTz), to: toYMD(customRange.to, tenantTz) }
      : typeof rangeDays === "number"
        ? getDateRange(rangeDays, tenantTz)
        : getDateRange(30, tenantTz)

  // Branch filter applies to visit-based widgets (KPIs, visits chart, heatmap,
  // export). Client-base widgets (funnel, segments, wallet, retention, top
  // clients) are tenant-wide — a client is not tied to one branch.
  const locationQuery = locationId !== ALL_LOCATIONS ? `&locationId=${locationId}` : ""
  const scopeLabel =
    locationId !== ALL_LOCATIONS ? locations.find((l) => l.id === locationId)?.name : undefined

  async function handleExportVisits() {
    if (!tenantSlug) return
    setExporting(true)
    try {
      const { from, to } = currentRange
      const res = await fetch(
        `/api/${tenantSlug}/analytics/export-visits?from=${from}&to=${to}${locationQuery}`,
      )
      if (!res.ok) {
        setError("Error al exportar visitas")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `visitas-${from}-a-${to}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Error de conexion al exportar")
    } finally {
      setExporting(false)
    }
  }

  // Stable strings so the callback only changes when the query actually does.
  const rangeFrom = currentRange.from
  const rangeTo = currentRange.to

  const fetchAnalytics = useCallback(async () => {
    if (!tenantSlug) return

    setLoading(true)
    setError(null)

    const base = `/api/${tenantSlug}/analytics`
    const range = `from=${rangeFrom}&to=${rangeTo}`

    try {
      const responses = await Promise.all(
        [
          `${base}/visits?${range}&granularity=${period}${locationQuery}`,
          `${base}/retention?months=6`,
          `${base}/summary?${range}${locationQuery}`,
          `${base}/wallet-distribution`,
          `${base}/heatmap?${range}${locationQuery}`,
          `${base}/funnel`,
          `${base}/segments`,
        ].map((u) => fetch(u).then((r) => r.json())),
      )
      const [
        visitsJson,
        retentionJson,
        summaryJson,
        walletJson,
        heatmapJson,
        funnelJson,
        segmentsJson,
      ] = responses as Array<{ success: boolean; data?: unknown }>

      // `undefined` when that call failed — leave the previous value in place.
      const pick = <T,>(j: { success: boolean; data?: unknown }, fallback: T): T | undefined =>
        j.success ? ((j.data as T) ?? fallback) : undefined

      const v = pick<VisitsChartRow[]>(visitsJson, [])
      if (v) setVisits(v)
      const r = pick<RetentionRow[]>(retentionJson, [])
      if (r) setRetention(r)
      const s = pick<AnalyticsSummary>(summaryJson, EMPTY_SUMMARY)
      if (s) {
        setSummary(s)
        setTopClients(
          (s.topClients ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            visitCount: c.visitCount,
          })),
        )
      }
      const w = pick<WalletDistribution>(walletJson, { apple: 0, google: 0, none: 0 })
      if (w) setWalletDist(w)
      const h = pick<HeatmapData>(heatmapJson, EMPTY_HEATMAP)
      if (h) setHeatmap(h)
      const f = pick<FunnelData>(funnelJson, EMPTY_FUNNEL)
      if (f) setFunnel(f)
      const g = pick<SegmentsData>(segmentsJson, EMPTY_SEGMENTS)
      if (g) setSegments(g)

      // Check if all failed
      if (!visitsJson.success && !retentionJson.success && !summaryJson.success) {
        setError("No se pudieron cargar los datos de analítica.")
      }
    } catch {
      setError("Error de conexión al cargar analítica.")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, rangeFrom, rangeTo, period, locationQuery])

  useEffect(() => {
    if (tenantSlug) {
      fetchAnalytics()
    }
  }, [tenantSlug, fetchAnalytics])

  // Branches (only shown when there are 2+)
  useEffect(() => {
    if (!tenantSlug) return
    fetch(`/api/${tenantSlug}/locations`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) {
          setLocations(
            j.data.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })),
          )
        }
      })
      .catch(() => {
        // silent — selector simply stays hidden
      })
  }, [tenantSlug])

  // Fetch tenant's first visit date to constrain the custom date picker minDate
  useEffect(() => {
    if (!tenantSlug) return
    fetch(`/api/${tenantSlug}/analytics/first-visit`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.firstVisitDate) {
          const [y, m, d] = (j.data.firstVisitDate as string).split("-").map(Number)
          setMinDate(new Date(y, m - 1, d))
        }
      })
      .catch(() => {
        // silent
      })
  }, [tenantSlug])

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (tenantError) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{tenantError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Analítica</h1>
          <p className="text-sm text-muted-foreground">Comportamiento de tus clientes.</p>
        </div>

        {/* Date range selector + export */}
        <div className="flex flex-wrap items-center gap-2">
          <LocationSelect locations={locations} value={locationId} onChange={setLocationId} />
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.days}
              variant={rangeDays === opt.days ? "default" : "outline"}
              size="sm"
              className="text-xs h-8"
              onClick={() => setRangeDays(opt.days)}
            >
              {opt.label}
            </Button>
          ))}
          <DateRangePicker
            value={customRange}
            onChange={(r) => {
              setCustomRange(r)
              if (r?.from && r.to) setRangeDays("custom")
            }}
            minDate={minDate}
            active={rangeDays === "custom"}
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 gap-1.5 ml-1"
            onClick={handleExportVisits}
            disabled={exporting || loading}
            type="button"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Exportar visitas</span>
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading overlay */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando datos...</span>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <KpiCards summary={summary} />

          {/* Visits Chart */}
          <VisitsChart data={visits} period={period} onPeriodChange={setPeriod} />

          {/* When do clients come */}
          <VisitsHeatmap data={heatmap} scopeLabel={scopeLabel} />

          {/* Client base: funnel + segments */}
          <div className="grid lg:grid-cols-2 gap-6">
            <FunnelChart data={funnel} />
            <SegmentsChart data={segments} />
          </div>

          {/* Top clients + wallet platform */}
          <div className="grid lg:grid-cols-2 gap-6">
            <TopClientsTable clients={topClients} />
            <WalletDistributionChart data={walletDist} />
          </div>

          {/* Retention cohorts (needs the width) */}
          <RetentionHeatmap data={retention} />
        </>
      )}
    </div>
  )
}
