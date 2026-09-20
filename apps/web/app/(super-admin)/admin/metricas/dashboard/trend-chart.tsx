"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

type MetricKey = "visits" | "newClients" | "installs" | "redemptions"
const METRICS: Record<MetricKey, string> = {
  visits: "Visitas",
  newClients: "Clientes nuevos",
  installs: "Pases instalados (Apple)",
  redemptions: "Canjes",
}
type Gran = "day" | "week" | "month"

function label(ymd: string, gran: Gran): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const date = new Date(y, m - 1, d, 12)
  if (gran === "month") return date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

function bucket(dates: string[], values: number[], gran: Gran): Array<{ date: string; v: number }> {
  if (gran === "day") return dates.map((date, i) => ({ date, v: values[i] ?? 0 }))
  const out = new Map<string, number>()
  dates.forEach((date, i) => {
    const [y, m, d] = date.split("-").map(Number)
    const dt = new Date(y, m - 1, d, 12)
    let key: string
    if (gran === "week") {
      const day = (dt.getDay() + 6) % 7 // Monday = 0
      dt.setDate(dt.getDate() - day)
      key = dt.toLocaleDateString("en-CA")
    } else {
      key = `${y}-${String(m).padStart(2, "0")}-01`
    }
    out.set(key, (out.get(key) ?? 0) + (values[i] ?? 0))
  })
  return [...out.entries()].map(([date, v]) => ({ date, v }))
}

/** One chart, current period against the previous one, with metric and granularity selectors. */
export function TrendChart({ data }: { data: PlatformMetrics }) {
  const [metric, setMetric] = useState<MetricKey>("visits")
  const defaultGran: Gran =
    data.range.days <= 31 ? "day" : data.range.days <= 120 ? "week" : "month"
  const [gran, setGran] = useState<Gran | null>(null)
  const g = gran ?? defaultGran

  const rows = useMemo(() => {
    const cur = bucket(data.daily.dates, data.daily[metric].cur, g)
    const prev = bucket(data.daily.prevDates, data.daily[metric].prev, g)
    return cur.map((c, i) => ({
      label: label(c.date, g),
      actual: c.v,
      anterior: prev[i]?.v ?? 0,
      prevLabel: prev[i] ? label(prev[i].date, g) : "",
    }))
  }, [data, metric, g])

  const totalCur = rows.reduce((a, r) => a + r.actual, 0)
  const totalPrev = rows.reduce((a, r) => a + r.anterior, 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Tendencia</h3>
          <p className="text-xs text-slate-400">
            {METRICS[metric]}: {totalCur.toLocaleString("es-PE")} ahora ·{" "}
            {totalPrev.toLocaleString("es-PE")} en el período anterior
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger size="sm" className="w-52 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METRICS) as MetricKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {METRICS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={g} onValueChange={(v) => setGran(v as Gran)}>
            <SelectTrigger size="sm" className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {totalCur === 0 && totalPrev === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-slate-400">
          Sin datos en este rango.
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="cur" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0e70db" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0e70db" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(value: number, name: string, item) => [
                  value.toLocaleString("es-PE"),
                  name === "anterior"
                    ? `Anterior (${(item.payload as { prevLabel: string }).prevLabel})`
                    : "Este período",
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v) => (v === "actual" ? "Este período" : "Período anterior")}
              />
              <Area
                type="monotone"
                dataKey="anterior"
                stroke="#94a3b8"
                strokeDasharray="4 3"
                fill="none"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#0e70db"
                fill="url(#cur)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
