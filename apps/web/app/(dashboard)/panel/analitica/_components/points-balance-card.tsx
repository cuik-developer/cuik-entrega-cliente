"use client"

import type { PointsAnalytics } from "@cuik/shared/types/analytics"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"

type Props = {
  balances: PointsAnalytics["balances"]
  incentives: PointsAnalytics["incentives"]
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

/**
 * Cuántos clientes ya pueden canjear. Es la lectura más accionable de un
 * programa de puntos: "40 clientes alcanzan un premio y no lo cobraron" es
 * una campaña lista. Abajo, lo que cuestan los incentivos del período.
 */
export function PointsBalanceCard({ balances, incentives }: Props) {
  const total = balances.activeClients
  const hasCatalog = balances.cheapestCost !== null
  const rows = [
    {
      key: "cheapest",
      label: hasCatalog ? `Ya pueden canjear algo (≥ ${balances.cheapestCost} pts)` : "—",
      count: balances.canRedeemCheapest,
      tone: "color-mix(in srgb, var(--color-ent-accent) 70%, transparent)",
    },
    {
      key: "top",
      label: hasCatalog ? `Alcanzan el premio más caro (≥ ${balances.mostExpensiveCost} pts)` : "—",
      count: balances.canRedeemMostExpensive,
      tone: "var(--color-ent-accent)",
    },
    {
      key: "below",
      label: hasCatalog
        ? `Aún no llegan al premio más barato (${balances.cheapestCost} pts)`
        : "Sin premios activos en el catálogo",
      count: balances.belowCheapest,
      tone: "color-mix(in srgb, var(--color-ent-accent) 35%, transparent)",
    },
  ]

  return (
    <Panel>
      <PanelHeader
        title="¿Quiénes ya pueden canjear?"
        actions={
          <span className="text-[11.5px] text-ent-fg-3">
            {total.toLocaleString("es-PE")} clientes activos
          </span>
        }
      />
      {total === 0 ? (
        <PanelMessage>Aún no tenés clientes.</PanelMessage>
      ) : (
        <ol className="p-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-[12px] mb-1">
                <span className="text-ent-fg-2 truncate">{row.label}</span>
                <span className="tabular-nums text-ent-fg-3 shrink-0">
                  <span className="font-semibold text-ent-fg">{row.count}</span>
                  {" · "}
                  {pct(row.count, total)}%
                </span>
              </div>
              <div className="h-3.5 w-full rounded-[2px] bg-ent-panel-2 overflow-hidden">
                <div
                  className="h-full rounded-[2px] transition-[width]"
                  style={{
                    width: `${Math.max(pct(row.count, total), row.count > 0 ? 2 : 0)}%`,
                    backgroundColor: row.tone,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="grid grid-cols-2 border-t border-ent-line">
        <div className="px-3 py-2 border-r border-ent-line min-w-0">
          <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 truncate">
            Bono de registro
          </div>
          <div className="text-[15px] leading-6 font-semibold text-ent-fg tabular-nums">
            {incentives.bonusPoints.toLocaleString("es-PE")}
            <span className="text-[11px] font-normal text-ent-fg-3 ml-1">pts en el período</span>
          </div>
        </div>
        <div className="px-3 py-2 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 truncate">
            Extra por cumpleaños
          </div>
          <div className="text-[15px] leading-6 font-semibold text-ent-fg tabular-nums">
            {incentives.birthdayExtraPoints.toLocaleString("es-PE")}
            <span className="text-[11px] font-normal text-ent-fg-3 ml-1">pts en el período</span>
          </div>
        </div>
      </div>
      <p className="px-3 pb-2 text-[11px] text-ent-fg-3">
        Las dos primeras filas se solapan: quien alcanza el más caro también alcanza el más barato.
      </p>
    </Panel>
  )
}
