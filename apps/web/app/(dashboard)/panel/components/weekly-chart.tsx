"use client"

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type WeeklyData = {
  day: string
  visits: number
}

function CustomTooltip({
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
    <div className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg">
      <span className="font-medium">{label}</span>: {payload[0].value} visitas
    </div>
  )
}

export function WeeklyChart({ data }: { data: WeeklyData[] }) {
  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-700">Visitas esta semana</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
            />
            <Bar dataKey="visits" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
