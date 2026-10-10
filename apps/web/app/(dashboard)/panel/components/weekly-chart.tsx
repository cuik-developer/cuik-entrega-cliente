"use client"

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Panel, PanelHeader } from "@/components/admin/enterprise"

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
    <div className="bg-ent-panel border border-ent-line rounded-[4px] text-[12px] text-ent-fg px-2.5 py-1.5">
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
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <Panel className="h-full flex flex-col">
      <PanelHeader
        title={title}
        actions={
          <span className="text-[11.5px] text-ent-fg-3 tabular-nums">
            {total.toLocaleString("es-PE")} {unit} en 7 días
          </span>
        }
      />
      <div className="px-2 pt-3 pb-1 flex-1">
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={data} margin={{ top: 14, right: 8, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--color-ent-fg-3)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-ent-fg-3)" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              content={<CustomTooltip unit={unit} />}
              cursor={{ fill: "var(--color-ent-panel-2)" }}
            />
            <Bar
              dataKey="value"
              fill="var(--color-ent-accent)"
              radius={[2, 2, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={4}
                fontSize={11}
                fill="var(--color-ent-fg-2)"
                formatter={(v: number) => (v > 0 ? v.toLocaleString("es-PE") : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
