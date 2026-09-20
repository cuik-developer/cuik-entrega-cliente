"use client"

import type { PointsSeriesRow } from "@cuik/shared/types/analytics"
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Period = "day" | "week" | "month"

const PERIOD_LABELS: Record<Period, string> = { day: "día", week: "semana", month: "mes" }

function formatDateLabel(dateStr: string, period: Period): string {
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
  period: Period
}

/** Puntos otorgados vs canjeados por período. Comparte la granularidad del gráfico de visitas. */
export function PointsFlowChart({ data, period }: Props) {
  const formatted = data.map((row) => ({ ...row, label: formatDateLabel(row.date, period) }))
  const total = data.reduce((acc, r) => acc + r.earned + r.redeemed, 0)

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">
          Puntos por {PERIOD_LABELS[period]}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Otorgados contra canjeados. Si los canjes no acompañan, los clientes acumulan sin cobrar.
        </p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin movimientos de puntos en este período.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-popover)",
                    color: "var(--color-popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString("es-PE")} pts`,
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="earned"
                  name="Otorgados"
                  fill="#0e70db"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="redeemed"
                  name="Canjeados"
                  fill="#ff4810"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
