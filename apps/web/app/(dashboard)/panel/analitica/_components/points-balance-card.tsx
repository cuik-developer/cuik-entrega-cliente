"use client"

import type { PointsAnalytics } from "@cuik/shared/types/analytics"
import { Cake, Gift } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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
      key: "below",
      label: hasCatalog
        ? `Todavía sin saldo para ningún premio (menos de ${balances.cheapestCost} pts)`
        : "Sin premios activos en el catálogo",
      count: balances.belowCheapest,
      tone: "color-mix(in srgb, var(--color-primary) 35%, transparent)",
    },
    {
      key: "cheapest",
      label: hasCatalog
        ? `Ya alcanzan al menos un premio (${balances.cheapestCost} pts o más)`
        : "—",
      count: balances.canRedeemCheapest,
      tone: "color-mix(in srgb, var(--color-primary) 70%, transparent)",
    },
    {
      key: "top",
      label: hasCatalog
        ? `Incluso alcanzan el más caro (${balances.mostExpensiveCost} pts o más)`
        : "—",
      count: balances.canRedeemMostExpensive,
      tone: "var(--color-primary)",
    },
  ]

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">
          ¿Quiénes ya pueden canjear?
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Saldos actuales de {total.toLocaleString("es-PE")} clientes activos frente a tu catálogo.
          Las dos últimas filas se solapan: quien alcanza el más caro también alcanza el más barato.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aún no tenés clientes.</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between text-xs mb-1 gap-3">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    <span className="font-bold text-foreground">{row.count}</span>
                    {" · "}
                    {pct(row.count, total)}%
                  </span>
                </div>
                <div className="h-5 w-full rounded-md bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-md transition-[width]"
                    style={{
                      width: `${Math.max(pct(row.count, total), row.count > 0 ? 3 : 0)}%`,
                      backgroundColor: row.tone,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-extrabold text-foreground tabular-nums">
                {incentives.bonusPoints.toLocaleString("es-PE")}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                pts regalados por bono de registro
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400 flex items-center justify-center shrink-0">
              <Cake className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-extrabold text-foreground tabular-nums">
                {incentives.birthdayExtraPoints.toLocaleString("es-PE")}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                pts extra por cumpleaños
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
