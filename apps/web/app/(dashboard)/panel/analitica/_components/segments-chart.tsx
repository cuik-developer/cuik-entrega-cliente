"use client"

import type { SegmentsData } from "@cuik/shared/types/analytics"
import Link from "next/link"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SEGMENT_LABELS } from "@/lib/loyalty/client-segments"

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

const SEGMENT_HINT: Record<string, string> = {
  nuevo: "Registrados hace pocos días",
  frecuente: "Vienen seguido",
  esporadico: "Vienen, pero espaciado",
  regular: "Sin un patrón claro todavía",
  en_riesgo: "Eran frecuentes y dejaron de venir",
  one_time: "Una sola visita, hace tiempo",
  inactivo: "Nunca visitaron",
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
    <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-lg">
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
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">
          Distribución por segmento
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hoy · todo el comercio. Mismo criterio que los filtros de Clientes.
        </p>
      </CardHeader>
      <CardContent>
        {data.total === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aún no tenés clientes registrados.
          </p>
        ) : (
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  dataKey="value"
                  nameKey="name"
                  strokeWidth={2}
                  stroke="white"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex-1 space-y-1.5 min-w-0">
              {entries.map((item) => {
                const p = data.total > 0 ? Math.round((item.value / data.total) * 100) : 0
                return (
                  <Link
                    key={item.key}
                    href={`/panel/clientes?segment=${item.key}`}
                    title={SEGMENT_HINT[item.key]}
                    className="flex items-center gap-2.5 text-sm rounded px-1 -mx-1 hover:bg-muted transition-colors"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                    <span className="ml-auto tabular-nums font-bold text-foreground">
                      {item.value}
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {p}%
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
