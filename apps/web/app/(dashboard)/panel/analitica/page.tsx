"use client"

import type {
  AnalyticsSummary,
  FunnelData,
  HeatmapData,
  PointsAnalytics,
  SegmentsData,
} from "@cuik/shared/types/analytics"
import { Download, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Notice, PageHeader, Panel, PanelMessage } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import type { TenantTrend } from "@/lib/analytics/tenant-trend"
import { defaultGranularity, rangeDays, type TrendGranularity } from "@/lib/analytics/trend-buckets"

import { AnalyticsToolbar, type PeriodState } from "./_components/analytics-toolbar"
import { CumulativeExportButton } from "./_components/cumulative-export-button"
import { FunnelChart } from "./_components/funnel-chart"
import { KpiStrip } from "./_components/kpi-strip"
import { ALL_LOCATIONS, type LocationOption } from "./_components/location-select"
import { presetRange } from "./_components/period"
import { PointsBalanceCard } from "./_components/points-balance-card"
import { PointsFlowChart } from "./_components/points-flow-chart"
import { RetentionHeatmap, type RetentionRow } from "./_components/retention-heatmap"
import { SegmentsChart } from "./_components/segments-chart"
import { type TopClientRow, TopClientsTable } from "./_components/top-clients-table"
import { TopRewardsTable } from "./_components/top-rewards-table"
import { TrendChart } from "./_components/trend-chart"
import { VisitsHeatmap } from "./_components/visits-heatmap"
import {
  type WalletDistribution,
  WalletDistributionChart,
} from "./_components/wallet-distribution-chart"

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

type Json = { success: boolean; data?: unknown }

/** Applies a successful response; a failed (or skipped) call leaves the previous value in place. */
function applyIfOk<T>(j: Json | undefined, fallback: T, set: (v: T) => void) {
  if (j?.success) set((j.data as T) ?? fallback)
}

export default function AnaliticaPage() {
  const {
    tenantSlug,
    timezone: tenantTz,
    promotionType,
    isLoading: tenantLoading,
    error: tenantError,
  } = useTenant()
  const isPoints = promotionType === "points"

  // Period: presets resolve against the tenant tz, so wait for it before the first fetch.
  const [period, setPeriod] = useState<PeriodState | null>(null)
  useEffect(() => {
    if (!tenantLoading && !period) setPeriod({ preset: "30d", ...presetRange("30d", tenantTz) })
  }, [tenantLoading, tenantTz, period])

  const [minDate, setMinDate] = useState<Date | undefined>(undefined)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationId, setLocationId] = useState<string>(ALL_LOCATIONS)

  // Trend granularity: follows the span until the user picks one explicitly.
  const [granPick, setGranPick] = useState<TrendGranularity | null>(null)
  const granularity: TrendGranularity =
    granPick ?? (period ? defaultGranularity(rangeDays(period.from, period.to)) : "day")

  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY)
  const [topClients, setTopClients] = useState<TopClientRow[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [walletDist, setWalletDist] = useState<WalletDistribution>({ apple: 0, google: 0, none: 0 })
  const [heatmap, setHeatmap] = useState<HeatmapData>(EMPTY_HEATMAP)
  const [funnel, setFunnel] = useState<FunnelData>(EMPTY_FUNNEL)
  const [segments, setSegments] = useState<SegmentsData>(EMPTY_SEGMENTS)
  const [points, setPoints] = useState<PointsAnalytics | null>(null)
  const [trend, setTrend] = useState<TenantTrend | null>(null)

  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const reqId = useRef(0)
  const trendReqId = useRef(0)

  // Branch filter applies to visit-based widgets (KPIs, trend, heatmap, points
  // earned, export). Client-base widgets (funnel, segments, wallet, retention,
  // top clients) are tenant-wide — a client is not tied to one branch.
  const locationQuery = locationId !== ALL_LOCATIONS ? `&locationId=${locationId}` : ""
  const scopeLabel =
    locationId !== ALL_LOCATIONS ? locations.find((l) => l.id === locationId)?.name : undefined

  const rangeFrom = period?.from
  const rangeTo = period?.to

  const fetchAnalytics = useCallback(async () => {
    if (!tenantSlug || !rangeFrom || !rangeTo) return
    const id = ++reqId.current
    setLoading(true)
    setError(null)

    const base = `/api/${tenantSlug}/analytics`
    const range = `from=${rangeFrom}&to=${rangeTo}`
    try {
      const responses = (await Promise.all(
        [
          `${base}/summary?${range}${locationQuery}`,
          `${base}/retention?months=6`,
          `${base}/wallet-distribution`,
          `${base}/heatmap?${range}${locationQuery}`,
          `${base}/funnel`,
          `${base}/segments`,
          // Points widgets only exist for points programs; skip the call otherwise.
          ...(isPoints
            ? [`${base}/points?${range}&granularity=${granularity}${locationQuery}`]
            : []),
        ].map((u) => fetch(u).then((r) => r.json())),
      )) as Json[]
      if (id !== reqId.current) return // superseded by a newer request

      const [
        summaryJson,
        retentionJson,
        walletJson,
        heatmapJson,
        funnelJson,
        segmentsJson,
        pointsJson,
      ] = responses

      applyIfOk<AnalyticsSummary>(summaryJson, EMPTY_SUMMARY, (s) => {
        setSummary(s)
        setTopClients(
          (s.topClients ?? []).map((c) => ({ id: c.id, name: c.name, visitCount: c.visitCount })),
        )
      })
      applyIfOk<RetentionRow[]>(retentionJson, [], setRetention)
      applyIfOk<WalletDistribution>(walletJson, { apple: 0, google: 0, none: 0 }, setWalletDist)
      applyIfOk<HeatmapData>(heatmapJson, EMPTY_HEATMAP, setHeatmap)
      applyIfOk<FunnelData>(funnelJson, EMPTY_FUNNEL, setFunnel)
      applyIfOk<SegmentsData>(segmentsJson, EMPTY_SEGMENTS, setSegments)
      applyIfOk<PointsAnalytics | null>(pointsJson, null, setPoints)

      if (!summaryJson.success && !heatmapJson.success && !funnelJson.success) {
        setError("No se pudieron cargar los datos de analítica.")
      }
    } catch {
      if (id === reqId.current) setError("Error de conexión al cargar analítica.")
    } finally {
      if (id === reqId.current) {
        setLoading(false)
        setLoadedOnce(true)
      }
    }
  }, [tenantSlug, rangeFrom, rangeTo, locationQuery, isPoints, granularity])

  // The trend has its own request so changing the bucket size does not reload the page.
  const fetchTrend = useCallback(async () => {
    if (!tenantSlug || !rangeFrom || !rangeTo) return
    const id = ++trendReqId.current
    setTrendLoading(true)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/analytics/trend?from=${rangeFrom}&to=${rangeTo}&granularity=${granularity}${locationQuery}`,
      )
      const json = (await res.json()) as Json
      if (id !== trendReqId.current) return
      if (json.success) setTrend(json.data as TenantTrend)
    } catch {
      // keep the previous series; the page-level error covers connection loss
    } finally {
      if (id === trendReqId.current) setTrendLoading(false)
    }
  }, [tenantSlug, rangeFrom, rangeTo, granularity, locationQuery])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  // Branches (selector only shows when there are 2+)
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

  // Tenant's first visit date constrains the custom date picker.
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

  async function handleExportVisits() {
    if (!tenantSlug || !period) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/analytics/export-visits?from=${period.from}&to=${period.to}${locationQuery}`,
      )
      if (!res.ok) {
        setError("Error al exportar visitas")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `visitas-${period.from}-a-${period.to}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Error de conexión al exportar")
    } finally {
      setExporting(false)
    }
  }

  if (tenantLoading || !period) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }

  if (tenantError) {
    return <Notice tone="bad">{tenantError}</Notice>
  }

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Panel", href: "/panel" }, { label: "Analítica" }]}
        title="Analítica"
        subtitle="Comportamiento de tus clientes en el período elegido."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[12px] gap-1.5 rounded-[4px]"
              onClick={handleExportVisits}
              disabled={exporting || loading}
              type="button"
              title="Excel con una fila por visita del período"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Exportar visitas</span>
            </Button>
            <CumulativeExportButton tenantSlug={tenantSlug} timezone={tenantTz} />
          </>
        }
      />

      <Panel>
        <AnalyticsToolbar
          period={period}
          onChange={(p) => {
            setPeriod(p)
            setGranPick(null) // back to the span's natural bucket size
          }}
          timezone={tenantTz}
          minDate={minDate}
          locations={locations}
          locationId={locationId}
          onLocationChange={setLocationId}
          loading={loading}
        />
      </Panel>

      {error && <Notice tone="bad">{error}</Notice>}

      {!loadedOnce ? (
        <PanelMessage className="py-20">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando datos…
        </PanelMessage>
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <KpiStrip summary={summary} points={isPoints ? points?.kpis : null} />

          <TrendChart
            data={trend}
            loading={trendLoading}
            granularity={granularity}
            onGranularityChange={setGranPick}
            isPoints={isPoints}
          />

          {isPoints && points && (
            <>
              <PointsFlowChart data={points.series} period={granularity} />
              <div className="grid lg:grid-cols-2 gap-3">
                <TopRewardsTable rewards={points.topRewards} timezone={tenantTz} />
                <PointsBalanceCard balances={points.balances} incentives={points.incentives} />
              </div>
            </>
          )}

          <VisitsHeatmap data={heatmap} scopeLabel={scopeLabel} />

          <div className="grid lg:grid-cols-2 gap-3">
            <FunnelChart data={funnel} programType={promotionType} />
            <SegmentsChart data={segments} />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <TopClientsTable clients={topClients} />
            <WalletDistributionChart data={walletDist} />
          </div>

          <RetentionHeatmap data={retention} />
        </div>
      )}
    </div>
  )
}
