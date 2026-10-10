"use client"

import { Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TenantTrend, TrendSeriesKey } from "@/lib/analytics/tenant-trend"
import type { TrendGranularity } from "@/lib/analytics/trend-buckets"
import { cn } from "@/lib/utils"

const SERIES: Record<TrendSeriesKey, { label: string; color: string; unit?: string }> = {
  visits: { label: "Visitas", color: "#0b5fc0" },
  newClients: { label: "Clientes nuevos", color: "#1f7a3f" },
  redemptions: { label: "Canjes", color: "#c2410c" },
  points: { label: "Puntos otorgados", color: "#6d28d9", unit: "pts" },
}
const ORDER: TrendSeriesKey[] = ["visits", "newClients", "redemptions", "points"]

const GRAN_LABEL: Record<TrendGranularity, string> = { day: "Día", week: "Semana", month: "Mes" }

function label(ymd: string, gran: TrendGranularity, long = false): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const date = new Date(y, m - 1, d, 12)
  if (gran === "month") {
    return date.toLocaleDateString("es-PE", { month: long ? "long" : "short", year: "2-digit" })
  }
  const day = date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
  return gran === "week" ? (long ? `Semana del ${day}` : day) : day
}

type Props = {
  data: TenantTrend | null
  loading: boolean
  granularity: TrendGranularity
  onGranularityChange: (g: TrendGranularity) => void
  /** Points programs get the "Puntos otorgados" series (right axis). */
  isPoints: boolean
}

/**
 * The Métricas "Tendencia" chart, scoped to one tenant: pick which series to
 * draw (several at once) and the bucket size. Points sit on their own axis
 * because they dwarf counts.
 */
export function TrendChart({ data, loading, granularity, onGranularityChange, isPoints }: Props) {
  const [enabled, setEnabled] = useState<Set<TrendSeriesKey>>(() => new Set(["visits"]))

  const available = ORDER.filter((k) => k !== "points" || isPoints)
  const active = available.filter((k) => enabled.has(k))

  function toggle(k: TrendSeriesKey) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(k)) {
        if (next.size === 1) return prev // keep at least one series
        next.delete(k)
      } else next.add(k)
      return next
    })
  }

  const rows = useMemo(() => {
    if (!data) return []
    return data.buckets.map((b, i) => ({
      bucket: b,
      label: label(b, granularity),
      visits: data.series.visits[i] ?? 0,
      newClients: data.series.newClients[i] ?? 0,
      redemptions: data.series.redemptions[i] ?? 0,
      points: data.series.points?.[i] ?? 0,
    }))
  }, [data, granularity])

  const empty = data !== null && active.every((k) => (data.totals[k] ?? 0) === 0)
  const showPointsAxis = active.includes("points")
  const countSeries = active.filter((k) => k !== "points")

  return (
    <Panel>
      <PanelHeader
        title="Tendencia"
        actions={
          <>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-ent-fg-3" />}
            <Select
              value={granularity}
              onValueChange={(v) => onGranularityChange(v as TrendGranularity)}
            >
              <SelectTrigger size="sm" className="h-7 w-28 text-[12px]" aria-label="Agrupar por">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(GRAN_LABEL) as TrendGranularity[]).map((g) => (
                  <SelectItem key={g} value={g}>
                    {GRAN_LABEL[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-ent-line">
        {available.map((k) => {
          const on = enabled.has(k)
          const total = data?.totals[k]
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(k)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] border text-[12px] font-medium transition-colors",
                on
                  ? "border-ent-line-strong bg-ent-panel text-ent-fg"
                  : "border-ent-line bg-ent-panel-2 text-ent-fg-3 hover:text-ent-fg-2",
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: on ? SERIES[k].color : "#b9c0ca" }}
                aria-hidden="true"
              />
              {SERIES[k].label}
              {total !== null && total !== undefined && (
                <span className="tabular-nums text-ent-fg-3 font-normal">
                  {total.toLocaleString("es-PE")}
                </span>
              )}
            </button>
          )
        })}
        {data && (
          <span className="ml-auto text-[11.5px] text-ent-fg-3 tabular-nums">
            {rows.length}{" "}
            {granularity === "day" ? "días" : granularity === "week" ? "semanas" : "meses"}
          </span>
        )}
      </div>

      {!data ? (
        <PanelMessage className="h-72">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sin datos."}
        </PanelMessage>
      ) : empty ? (
        <PanelMessage className="h-72">Sin movimientos en este rango.</PanelMessage>
      ) : (
        <div className={cn("h-72 p-2 pt-3 transition-opacity", loading && "opacity-60")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={rows}
              margin={{ top: 4, right: showPointsAxis ? 0 : 12, left: -12, bottom: 0 }}
            >
              <defs>
                {active.map((k) => (
                  <linearGradient key={k} id={`trend-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[k].color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={SERIES[k].color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#7a8392" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                yAxisId="count"
                tick={{ fontSize: 11, fill: "#7a8392" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                hide={countSeries.length === 0}
              />
              {showPointsAxis && (
                <YAxis
                  yAxisId="points"
                  orientation="right"
                  tick={{ fontSize: 11, fill: SERIES.points.color }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={56}
                />
              )}
              <Tooltip
                contentStyle={{
                  borderRadius: 4,
                  border: "1px solid #d9dde3",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                labelStyle={{ fontWeight: 600, color: "#161a20", marginBottom: 2 }}
                labelFormatter={(_, payload) => {
                  const b = (payload?.[0]?.payload as { bucket?: string } | undefined)?.bucket
                  return b ? label(b, granularity, true) : ""
                }}
                formatter={(value: number, name: string) => {
                  const s = SERIES[name as TrendSeriesKey]
                  return [
                    `${value.toLocaleString("es-PE")}${s?.unit ? ` ${s.unit}` : ""}`,
                    s?.label ?? name,
                  ]
                }}
              />
              {active.map((k) => (
                <Area
                  key={k}
                  yAxisId={k === "points" ? "points" : "count"}
                  type="monotone"
                  dataKey={k}
                  stroke={SERIES[k].color}
                  fill={`url(#trend-${k})`}
                  strokeWidth={k === active[0] ? 2 : 1.5}
                  dot={
                    rows.length <= 14 ? { r: 2.5, strokeWidth: 0, fill: SERIES[k].color } : false
                  }
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
