"use client"

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type WeeklyData = {
  day: string
  value: number
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  unit: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg">
      <span className="font-medium">{label}</span>: {payload[0].value} {unit}
    </div>
  )
}

/** Last 7 local days of one metric: visits for stamps programs, points granted for points. */
export function WeeklyChart({
  data,
  title = "Visitas esta semana",
  unit = "visitas",
}: {
  data: WeeklyData[]
  title?: string
  unit?: string
}) {
  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip unit={unit} />}
              cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
            />
            <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
