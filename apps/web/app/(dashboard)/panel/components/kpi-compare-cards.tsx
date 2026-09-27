import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { DayKpi } from "@/lib/dashboard/kpi-utils"
import { pctDelta } from "@/lib/dashboard/kpi-utils"

export type KpiCard = {
  key: string
  label: string
  icon: LucideIcon
  bg: string
  kpi: DayKpi
}

function DeltaPill({ kpi }: { kpi: DayKpi }) {
  const delta = pctDelta(kpi.today, kpi.previous)
  const up = delta > 0
  const flat = delta === 0
  const cls = flat
    ? "bg-slate-100 text-slate-600"
    : up
      ? "bg-emerald-100 text-emerald-700"
      : "bg-red-100 text-red-700"
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
      title="Variación contra el mismo día de la semana pasada, hasta esta misma hora"
    >
      {flat ? "" : up ? "▲ " : "▼ "}
      {Math.abs(delta)}%
    </span>
  )
}

/**
 * Today so far vs. the same weekday last week up to the same time of day.
 * One number per card on purpose — an accumulated week next to "today" read
 * as two different things and confused the operator. The list of cards is
 * chosen by the page: stamps and points programs measure different things.
 */
export function KpiCompareCards({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.key} className="border border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.bg}`}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
                {card.kpi.today}
              </span>
              <DeltaPill kpi={card.kpi} />
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              Sem. pasada a esta hora:{" "}
              <span className="font-medium text-slate-700">{card.kpi.previous}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
