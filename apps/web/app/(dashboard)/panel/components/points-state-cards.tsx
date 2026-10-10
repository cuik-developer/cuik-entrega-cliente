import { type Stat, StatStrip } from "@/components/admin/enterprise"
import type { PointsDashboardState } from "@/lib/dashboard/compute-points-dashboard"

/**
 * Where the points program stands right now: points out there, who can
 * already claim something, what is about to expire and what expired this
 * month. No comparison: these are stocks, not today's flow.
 */
export function PointsStateCards({ state }: { state: PointsDashboardState }) {
  const hasExpiry = state.policy !== null
  const dash = <span className="text-ent-fg-3">—</span>
  const stats: Stat[] = [
    {
      label: "Puntos en circulación",
      value: state.inCirculation,
      hint: "saldos de tus clientes",
    },
    {
      label: "Ya pueden canjear",
      value: state.canRedeem,
      hint:
        state.cheapestCost === null ? "sin premios en el catálogo" : `≥ ${state.cheapestCost} pts`,
      tone: state.canRedeem > 0 && state.cheapestCost !== null ? "ok" : "mute",
    },
    {
      label: "Por vencer en 7 días",
      value: hasExpiry ? state.expiringSoon.points : dash,
      hint: hasExpiry
        ? state.expiringSoon.clients === 0
          ? "ningún cliente afectado"
          : `${state.expiringSoon.clients} ${state.expiringSoon.clients === 1 ? "cliente" : "clientes"}`
        : "los puntos no vencen",
      tone: hasExpiry && state.expiringSoon.clients > 0 ? "warn" : "mute",
    },
    {
      label: "Vencidos este mes",
      value: hasExpiry ? state.expiredThisMonth : dash,
      hint: hasExpiry ? (state.policy ?? "") : "los puntos no vencen",
    },
  ]

  return <StatStrip stats={stats} />
}
