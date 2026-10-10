"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"

export type WalletDistribution = {
  apple: number
  google: number
  none: number
}

type ChartEntry = {
  key: keyof WalletDistribution
  name: string
  value: number
  color: string
}

const COLORS: Record<keyof WalletDistribution, string> = {
  apple: "#161a20",
  google: "#4285F4",
  none: "#b9c0ca",
}

const LABELS: Record<keyof WalletDistribution, string> = {
  apple: "Apple Wallet",
  google: "Google Wallet",
  none: "Sin wallet",
}

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
    <div className="rounded-[4px] bg-ent-topbar px-2.5 py-1 text-[12px] text-white shadow">
      <span className="font-medium">{item.payload.name}</span>: {item.value} cliente
      {item.value !== 1 ? "s" : ""}
    </div>
  )
}

type Props = {
  data: WalletDistribution
}

export function WalletDistributionChart({ data }: Props) {
  const entries: ChartEntry[] = (["apple", "google", "none"] as const).map((k) => ({
    key: k,
    name: LABELS[k],
    value: data[k],
    color: COLORS[k],
  }))
  const chartData = entries.filter((e) => e.value > 0)
  const total = data.apple + data.google + data.none

  return (
    <Panel>
      <PanelHeader
        title="Pases por plataforma"
        actions={<span className="text-[11.5px] text-ent-fg-3">Hoy · todo el comercio</span>}
      />
      {total === 0 ? (
        <PanelMessage>Sin datos de wallet disponibles.</PanelMessage>
      ) : (
        <div className="p-3">
          <div className="flex items-center gap-4">
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
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
                return (
                  <li key={item.key} className="flex items-center gap-2 h-7">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-ent-fg-2 truncate">{item.name}</span>
                    <span className="ml-auto tabular-nums font-semibold text-ent-fg">
                      {item.value}
                    </span>
                    <span className="w-9 text-right text-[11.5px] tabular-nums text-ent-fg-3">
                      {pct}%
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="mt-2 text-[11px] text-ent-fg-3">
            Apple se detecta cuando el iPhone instala el pase; Google se asume por el enlace de
            guardado.
          </p>
        </div>
      )}
    </Panel>
  )
}
