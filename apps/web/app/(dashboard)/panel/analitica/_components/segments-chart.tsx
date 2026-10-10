"use client"

import type { SegmentsData } from "@cuik/shared/types/analytics"
import Link from "next/link"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import { SEGMENT_HINTS, SEGMENT_LABELS } from "@/lib/loyalty/client-segments"

// Hex twins of SEGMENT_COLORS (Tailwind *-500) — recharts needs literal colours.
const SEGMENT_HEX: Record<string, string> = {
  nuevo: "#0ea5e9",
  frecuente: "#10b981",
  esporadico: "#f59e0b",
  regular: "#8b5cf6",
  en_riesgo: "#f97316",
  one_time: "#94a3b8",
  inactivo: "#ef4444",
}

type Entry = { key: string; name: string; value: number; color: string }

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: Entry }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-[4px] bg-ent-topbar px-2.5 py-1 text-[12px] text-white shadow">
      <span className="font-medium">{item.payload.name}</span>: {item.value} cliente
      {item.value !== 1 ? "s" : ""}
    </div>
  )
}

type Props = {
  data: SegmentsData
}

export function SegmentsChart({ data }: Props) {
  const entries: Entry[] = data.segments.map((s) => ({
    key: s.segment,
    name: SEGMENT_LABELS[s.segment as keyof typeof SEGMENT_LABELS] ?? s.segment,
    value: s.count,
    color: SEGMENT_HEX[s.segment] ?? "#94a3b8",
  }))
  const chartData = entries.filter((e) => e.value > 0)

  return (
    <Panel>
      <PanelHeader
        title="Distribución por segmento"
        actions={<span className="text-[11.5px] text-ent-fg-3">Hoy · todo el comercio</span>}
      />
      {data.total === 0 ? (
        <PanelMessage>Aún no tenés clientes registrados.</PanelMessage>
      ) : (
        <div className="flex items-center gap-4 p-3">
          <div className="shrink-0">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={64}
                  dataKey="value"
                  nameKey="name"
                  strokeWidth={2}
                  stroke="#ffffff"
                  isAnimationActive={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex-1 min-w-0 text-[12.5px]">
            {entries.map((item) => {
              const p = data.total > 0 ? Math.round((item.value / data.total) * 100) : 0
              return (
                <li key={item.key}>
                  <Link
                    href={`/panel/clientes?segment=${item.key}`}
                    title={SEGMENT_HINTS[item.key as keyof typeof SEGMENT_HINTS]}
                    className="flex items-center gap-2 h-7 px-1 -mx-1 rounded-[3px] hover:bg-ent-panel-2 transition-colors"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-ent-fg-2 truncate">{item.name}</span>
                    <span className="ml-auto tabular-nums font-semibold text-ent-fg">
                      {item.value}
                    </span>
                    <span className="w-9 text-right text-[11.5px] tabular-nums text-ent-fg-3">
                      {p}%
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Panel>
  )
}
