"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import type { PlanDistItem } from "../actions"

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: PlanDistItem }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg">
      <span className="font-medium">{item.payload.planName}</span>: {item.value} comercio
      {item.value !== 1 ? "s" : ""}
    </div>
  )
}

export function PlanDistribution({ data }: { data: PlanDistItem[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-400">Sin datos de planes</p>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-700">Distribución por plan</h3>
      <div className="flex items-center gap-8">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={72}
              dataKey="count"
              nameKey="planName"
              strokeWidth={2}
              stroke="white"
            >
              {data.map((entry) => (
                <Cell key={entry.planName} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-2.5">
          {data.map((p) => {
            const pct = total > 0 ? Math.round((p.count / total) * 100) : 0
            return (
              <div key={p.planName} className="flex items-center gap-2.5 text-sm">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-slate-600">{p.planName}</span>
                <span className="ml-auto tabular-nums font-bold text-slate-900">{p.count}</span>
                <span className="w-10 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
