"use client"

import type { AnalyticsSummary } from "@cuik/shared/types/analytics"
import { CalendarDays, Download, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { useTenant } from "@/hooks/use-tenant"

import { KpiCards } from "./_components/kpi-cards"
import type { RetentionRow } from "./_components/retention-heatmap"
import { RetentionHeatmap } from "./_components/retention-heatmap"
import type { TopClientRow } from "./_components/top-clients-table"
import { TopClientsTable } from "./_components/top-clients-table"
import type { VisitsChartRow } from "./_components/visits-chart"
import { VisitsChart } from "./_components/visits-chart"
import type { WalletDistribution } from "./_components/wallet-distribution-chart"
import { WalletDistributionChart } from "./_components/wallet-distribution-chart"

type Period = "day" | "week" | "month"

const RANGE_OPTIONS = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
] as const

function toYMD(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" })
}

function getDateRange(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: toYMD(from), to: toYMD(to) }
}

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
  const { tenantSlug, isLoading: tenantLoading, error: tenantError } = useTenant()

  const [rangeDays, setRangeDays] = useState<number | "custom">(30)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const [minDate, setMinDate] = useState<Date | undefined>(undefined)
  const [period, setPeriod] = useState<Period>("day")

  const [visits, setVisits] = useState<VisitsChartRow[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY)
  const [topClients, setTopClients] = useState<TopClientRow[]>([])

  const [walletDist, setWalletDist] = useState<WalletDistribution>({
    apple: 0,
    google: 0,
    none: 0,
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const currentRange =
    rangeDays === "custom" && customRange?.from && customRange.to
      ? { from: toYMD(customRange.from), to: toYMD(customRange.to) }
      : typeof rangeDays === "number"
        ? getDateRange(rangeDays)
        : getDateRange(30)

  async function handleExportVisits() {
    if (!tenantSlug) return
    setExporting(true)
    try {
      const { from, to } = currentRange
      const res = await fetch(`/api/${tenantSlug}/analytics/export-visits?from=${from}&to=${to}`)
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

  const fetchAnalytics = useCallback(async () => {
    if (!tenantSlug) return

    setLoading(true)
    setError(null)

    const { from, to } = currentRange

    try {
      const [visitsRes, retentionRes, summaryRes, walletRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/analytics/visits?from=${from}&to=${to}&granularity=${period}`),
        fetch(`/api/${tenantSlug}/analytics/retention?months=6`),
        fetch(`/api/${tenantSlug}/analytics/summary?from=${from}&to=${to}`),
        fetch(`/api/${tenantSlug}/analytics/wallet-distribution`),
      ])

      const [visitsJson, retentionJson, summaryJson, walletJson] = await Promise.all([
        visitsRes.json(),
        retentionRes.json(),
        summaryRes.json(),
        walletRes.json(),
      ])

      if (visitsJson.success) {
        setVisits(visitsJson.data ?? [])
      }
      if (retentionJson.success) {
        setRetention(retentionJson.data ?? [])
      }
      if (summaryJson.success) {
        const s = summaryJson.data
        setSummary(s ?? EMPTY_SUMMARY)
        setTopClients(
          (s?.topClients ?? []).map(
            (c: { id: string; name: string; visitCount: number; tier?: string | null }) => ({
              id: c.id,
              name: c.name,
              visitCount: c.visitCount,
              tier: c.tier ?? null,
            }),
          ),
        )
      }

      if (walletJson.success) {
        setWalletDist(walletJson.data ?? { apple: 0, google: 0, none: 0 })
      }

      // Check if all failed
      if (!visitsJson.success && !retentionJson.success && !summaryJson.success) {
        setError("No se pudieron cargar los datos de analítica.")
      }
    } catch {
      setError("Error de conexión al cargar analítica.")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, currentRange.from, currentRange.to, period])

  useEffect(() => {
    if (tenantSlug) {
      fetchAnalytics()
    }
  }, [tenantSlug, fetchAnalytics])

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

          {/* Bottom row: Top Clients + Retention Heatmap */}
          <div className="grid lg:grid-cols-2 gap-6">
            <TopClientsTable clients={topClients} />
            <RetentionHeatmap data={retention} />
          </div>

          {/* Wallet distribution */}
          <div className="grid lg:grid-cols-2 gap-6">
            <WalletDistributionChart data={walletDist} />
          </div>
        </>
      )}
    </div>
  )
}
