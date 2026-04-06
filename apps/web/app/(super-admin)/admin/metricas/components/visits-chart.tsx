"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { DailyVisit } from "../actions"

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg">
      <span className="font-medium">{label ? formatDateLabel(label) : ""}</span>:{" "}
      {payload[0].value.toLocaleString("es-PE")} visitas
    </div>
  )
}

export function VisitsChart({ data }: { data: DailyVisit[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-400">Sin datos de visitas en este periodo</p>
      </div>
    )
  }

  const chartData = data.map((d) => ({
    date: d.date,
    label: formatDateLabel(d.date),
    visits: d.count,
  }))

  const interval = Math.max(0, Math.floor(chartData.length / 7) - 1)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-700">Visitas diarias</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="visitAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval={interval}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{
              stroke: "var(--color-muted-foreground)",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
          />
          <Area
            type="monotone"
            dataKey="visits"
            stroke="var(--color-primary)"
            fill="url(#visitAreaGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
