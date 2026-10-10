import { Panel } from "@/components/admin/enterprise"
import type { DayKpi } from "@/lib/dashboard/kpi-utils"
import { pctDelta } from "@/lib/dashboard/kpi-utils"
import { cn } from "@/lib/utils"

export type KpiCard = {
  key: string
  label: string
  kpi: DayKpi
}

function Delta({ kpi }: { kpi: DayKpi }) {
  const delta = pctDelta(kpi.today, kpi.previous)
  const up = delta > 0
  const flat = delta === 0
  const cls = flat ? "text-ent-fg-3" : up ? "text-ent-ok" : "text-ent-bad"
  return (
    <span
      className={cn("text-[11px] font-medium tabular-nums ml-1.5", cls)}
      title="Variación contra el mismo día de la semana pasada, hasta esta misma hora"
    >
      {flat ? "" : up ? "▲ " : "▼ "}
      {Math.abs(delta)}%
    </span>
  )
}

/**
 * Today so far vs. the same weekday last week up to the same time of day.
 * One number per cell on purpose — an accumulated week next to "today" read
 * as two different things and confused the operator. The list of cells is
 * chosen by the page: stamps and points programs measure different things.
 *
 * Same anatomy as the enterprise `StatStrip`, plus the comparison line.
 */
export function KpiCompareCards({ cards }: { cards: KpiCard[] }) {
  return (
    <Panel className="grid grid-cols-2 md:grid-cols-4 overflow-hidden">
      {cards.map((card) => (
        <div
          key={card.key}
          className={cn(
            "px-3 py-2 min-w-0 border-ent-line",
            "[&:nth-child(n+3)]:border-t md:[&:nth-child(n+3)]:border-t-0",
            "odd:border-r md:border-r md:last:border-r-0",
          )}
        >
          <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 truncate">
            {card.label}
          </div>
          <div className="text-[18px] leading-6 font-semibold text-ent-fg tabular-nums truncate">
            {card.kpi.today}
            <Delta kpi={card.kpi} />
          </div>
          <div className="text-[11px] text-ent-fg-3 tabular-nums truncate">
            Sem. pasada a esta hora:{" "}
            <span className="font-medium text-ent-fg-2">{card.kpi.previous}</span>
          </div>
        </div>
      ))}
    </Panel>
  )
}
