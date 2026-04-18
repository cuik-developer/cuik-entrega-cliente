"use client"

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type VisitsChartRow = {
  date: string
  totalVisits: number
  uniqueClients: number
  newClients: number
}

type Period = "day" | "week" | "month"

const PERIOD_LABELS: Record<Period, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
}

function formatDateLabel(dateStr: string, period: Period): string {
  // dateStr arrives as "YYYY-MM-DD" (already bucketed in the tenant's tz by
  // the server). Construct the Date from components so it represents the
  // intended local day — new Date("YYYY-MM-DD") parses as UTC midnight and
  // drifts to the previous day in negative-offset browser timezones.
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return dateStr
  const date = new Date(y, m - 1, d, 12) // noon local to avoid DST edge cases
  if (period === "month") {
    return date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
  }
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

type Props = {
  data: VisitsChartRow[]
  period: Period
  onPeriodChange: (period: Period) => void
}

export function VisitsChart({ data, period, onPeriodChange }: Props) {
  const formatted = data.map((row) => ({
    ...row,
    label: formatDateLabel(row.date, period),
  }))

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-foreground">
            Visitas por {PERIOD_LABELS[period].toLowerCase()}
          </CardTitle>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as Period)}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "12px",
              }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  totalVisits: "Total visitas",
                  uniqueClients: "Clientes únicos",
                  newClients: "Clientes nuevos",
                }
                return [value, labels[name] ?? name]
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  totalVisits: "Total visitas",
                  uniqueClients: "Clientes únicos",
                  newClients: "Clientes nuevos",
                }
                return labels[value] ?? value
              }}
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            />
            <Bar dataKey="totalVisits" fill="#0e70db" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="uniqueClients" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="newClients" fill="#ff4810" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
