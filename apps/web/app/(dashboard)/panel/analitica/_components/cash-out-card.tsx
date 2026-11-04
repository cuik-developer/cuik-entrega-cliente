"use client"

import { Panel, PanelHeader } from "@/components/admin/enterprise"

export type CashOutData =
  | { enabled: false }
  | {
      enabled: true
      milestone: { at: number; label: string }
      finalReward: string | null
      maxVisits: number
      atRiskDays: number
      period: { cashOuts: number; avgStampsAtCashOut: number | null; fullCards: number }
      now: { inWindow: number; atRisk: number }
    }

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-ent-fg-3">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-ent-fg">{value}</p>
      {hint && <p className="text-[11.5px] text-ent-fg-3">{hint}</p>}
    </div>
  )
}

/**
 * Early cash-out ladder ("escalera canjeable"): who cashed the intermediate
 * reward and who went on to the full card, so the merchant can tell whether a
 * shorter card would serve better. Hidden when the program has no such reward.
 */
export function CashOutCard({ data }: { data: CashOutData }) {
  if (!data.enabled) return null
  const { period, now, milestone, maxVisits } = data
  const decided = period.cashOuts + period.fullCards
  const share = decided > 0 ? Math.round((period.cashOuts / decided) * 100) : null
  return (
    <Panel>
      <PanelHeader
        title="Escalera canjeable"
        actions={
          <span className="text-[11.5px] text-ent-fg-3">
            {milestone.label} en el sello {milestone.at} · tarjeta de {maxVisits}
          </span>
        }
      />
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Cobraron antes"
            value={String(period.cashOuts)}
            hint={share === null ? "En el periodo" : `${share} % de los que eligieron`}
          />
          <Stat
            label="Completaron la tarjeta"
            value={String(period.fullCards)}
            hint={data.finalReward ?? "Premio final"}
          />
          <Stat
            label="Sello promedio al cobrar"
            value={period.avgStampsAtCashOut === null ? "—" : String(period.avgStampsAtCashOut)}
            hint={`Desde el ${milestone.at}`}
          />
          <Stat
            label="Pueden cobrar hoy"
            value={String(now.inWindow)}
            hint={`${now.atRisk} sin venir hace ${data.atRiskDays}+ días`}
          />
        </div>
        <p className="text-[11px] text-ent-fg-3">
          "Cobraron antes" y "Completaron la tarjeta" cuentan los premios del periodo elegido;
          "Pueden cobrar hoy" es la foto de ahora. Si la mayoría cobra antes, una tarjeta de{" "}
          {milestone.at} sellos puede funcionar igual de bien. Los que pueden cobrar y dejaron de
          venir son el riesgo de la escalera: siguieron acumulando y no volvieron.
        </p>
      </div>
    </Panel>
  )
}
