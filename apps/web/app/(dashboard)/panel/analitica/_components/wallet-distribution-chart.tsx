"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type WalletDistribution = {
  apple: number
  google: number
  none: number
}

type ChartEntry = {
  name: string
  value: number
  color: string
}

const COLORS = {
  apple: "#000000",
  google: "#4285F4",
  none: "#9ca3af",
} as const

const LABELS = {
  apple: "Apple Wallet",
  google: "Google Wallet",
  none: "Sin wallet",
} as const

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: ChartEntry }>
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
  data: WalletDistribution
}

export function WalletDistributionChart({ data }: Props) {
  const chartData: ChartEntry[] = [
    { name: LABELS.apple, value: data.apple, color: COLORS.apple },
    { name: LABELS.google, value: data.google, color: COLORS.google },
    { name: LABELS.none, value: data.none, color: COLORS.none },
  ].filter((entry) => entry.value > 0)

  const total = data.apple + data.google + data.none

  if (total === 0) {
    return (
      <Card className="border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-foreground">
            Distribución por plataforma
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin datos de wallet disponibles.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">
          Distribución por plataforma
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
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
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="space-y-2.5">
            {[
              {
                key: "apple" as const,
                label: LABELS.apple,
                color: COLORS.apple,
                value: data.apple,
              },
              {
                key: "google" as const,
                label: LABELS.google,
                color: COLORS.google,
                value: data.google,
              },
              { key: "none" as const, label: LABELS.none, color: COLORS.none, value: data.none },
            ].map((item) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
              return (
                <div key={item.key} className="flex items-center gap-2.5 text-sm">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="ml-auto tabular-nums font-bold text-foreground">
                    {item.value}
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
