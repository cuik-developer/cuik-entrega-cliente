"use client"

import type { PointsSeriesRow } from "@cuik/shared/types/analytics"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import type { TrendGranularity } from "@/lib/analytics/trend-buckets"

const PERIOD_LABELS: Record<TrendGranularity, string> = { day: "día", week: "semana", month: "mes" }

function formatDateLabel(dateStr: string, period: TrendGranularity): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return dateStr
  const date = new Date(y, m - 1, d, 12)
  if (period === "month") {
    return date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
  }
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

type Props = {
  data: PointsSeriesRow[]
  period: TrendGranularity
}

/** Puntos otorgados vs canjeados por período. Comparte la granularidad de Tendencia. */
export function PointsFlowChart({ data, period }: Props) {
  const formatted = data.map((row) => ({ ...row, label: formatDateLabel(row.date, period) }))
  const total = data.reduce((acc, r) => acc + r.earned + r.redeemed, 0)

  return (
    <Panel>
      <PanelHeader
        title={`Puntos por ${PERIOD_LABELS[period]}`}
        actions={<span className="text-[11.5px] text-ent-fg-3">Otorgados vs. canjeados</span>}
      />
      {total === 0 ? (
        <PanelMessage>Sin movimientos de puntos en este período.</PanelMessage>
      ) : (
        <div className="h-60 p-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
                tick={{ fontSize: 11, fill: "#7a8392" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "#f7f8fa" }}
                contentStyle={{ borderRadius: 4, border: "1px solid #d9dde3", fontSize: 12 }}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString("es-PE")} pts`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11.5 }} iconType="circle" iconSize={8} />
              <Bar
                dataKey="earned"
                name="Otorgados"
                fill="#6d28d9"
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Bar
                dataKey="redeemed"
                name="Canjeados"
                fill="#c2410c"
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
