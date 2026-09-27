import { Coins, Gift, Hourglass, TimerOff } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { PointsDashboardState } from "@/lib/dashboard/compute-points-dashboard"

/**
 * Where the points program stands right now: points out there, who can
 * already claim something, what is about to expire and what expired this
 * month. No comparison pill: these are stocks, not today's flow.
 */
export function PointsStateCards({ state }: { state: PointsDashboardState }) {
  const hasExpiry = state.policy !== null
  const cards = [
    {
      key: "circulation",
      label: "Puntos en circulación",
      value: state.inCirculation,
      hint: "Suma de los saldos de tus clientes",
      icon: Coins,
      bg: "bg-blue-50 text-primary",
    },
    {
      key: "canRedeem",
      label: "Ya pueden canjear",
      value: state.canRedeem,
      hint:
        state.cheapestCost === null
          ? "Sin premios en el catálogo"
          : `Clientes con ${state.cheapestCost} pts o más`,
      icon: Gift,
      bg: "bg-emerald-50 text-emerald-600",
    },
    {
      key: "expiring",
      label: "Por vencer en 7 días",
      value: hasExpiry ? state.expiringSoon.points : null,
      hint: hasExpiry
        ? state.expiringSoon.clients === 0
          ? "Ningún cliente afectado"
          : `${state.expiringSoon.clients} ${state.expiringSoon.clients === 1 ? "cliente" : "clientes"}`
        : "Los puntos no vencen",
      icon: Hourglass,
      bg: "bg-amber-50 text-amber-600",
    },
    {
      key: "expired",
      label: "Vencidos este mes",
      value: hasExpiry ? state.expiredThisMonth : null,
      hint: hasExpiry ? (state.policy ?? "") : "Los puntos no vencen",
      icon: TimerOff,
      bg: "bg-red-50 text-red-500",
    },
  ]

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
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {card.value === null ? <span className="text-slate-300">—</span> : card.value}
            </div>
            <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
