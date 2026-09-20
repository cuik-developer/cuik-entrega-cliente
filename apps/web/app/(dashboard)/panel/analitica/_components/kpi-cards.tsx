"use client"

import type { AnalyticsSummary, PointsAnalytics } from "@cuik/shared/types/analytics"
import {
  Award,
  Coins,
  Percent,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

type Props = {
  summary: AnalyticsSummary
  /** When present (points programs) the redemption KPIs are replaced by points KPIs. */
  points?: PointsAnalytics["kpis"] | null
}

type KpiItem = {
  label: string
  value: string
  icon: typeof TrendingUp
  bg: string
  /** Change against the previous period, when it makes sense. */
  delta?: number | null
  hint?: string
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function buildPointsKpis(summary: AnalyticsSummary, p: PointsAnalytics["kpis"]): KpiItem[] {
  return [
    {
      label: "Total visitas",
      value: summary.totalVisits.toLocaleString("es-PE"),
      icon: TrendingUp,
      bg: "bg-blue-50 text-primary dark:bg-blue-950/50 dark:text-blue-400",
    },
    {
      label: "Clientes nuevos",
      value: summary.newClients.toLocaleString("es-PE"),
      icon: UserPlus,
      bg: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    },
    {
      label: "Puntos otorgados",
      value: p.earned.toLocaleString("es-PE"),
      icon: Coins,
      bg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
      delta: deltaPct(p.earned, p.earnedPrev),
      hint: deltaPct(p.earned, p.earnedPrev) === null ? undefined : "vs. período anterior",
    },
    {
      label: "Puntos canjeados",
      value: p.redeemed.toLocaleString("es-PE"),
      icon: Award,
      bg: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400",
      delta: deltaPct(p.redeemed, p.redeemedPrev),
      hint: deltaPct(p.redeemed, p.redeemedPrev) === null ? undefined : "vs. período anterior",
    },
    {
      label: "Puntos vigentes",
      value: p.outstanding.toLocaleString("es-PE"),
      icon: Wallet,
      bg: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
      hint: "saldo total de tus clientes",
    },
    {
      label: "Ticket promedio",
      value: p.avgTicket === null ? "—" : `S/ ${p.avgTicket.toFixed(2)}`,
      icon: Receipt,
      bg: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400",
      hint: p.ticketCount > 0 ? `${p.ticketCount.toLocaleString("es-PE")} compras` : undefined,
    },
  ]
}

function buildKpis(summary: AnalyticsSummary): KpiItem[] {
  return [
    {
      label: "Total visitas",
      value: summary.totalVisits.toLocaleString("es-PE"),
      icon: TrendingUp,
      bg: "bg-blue-50 text-primary dark:bg-blue-950/50 dark:text-blue-400",
    },
    {
      label: "Clientes totales",
      value: summary.uniqueClients.toLocaleString("es-PE"),
      icon: Users,
      bg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    },
    {
      label: "Clientes nuevos",
      value: summary.newClients.toLocaleString("es-PE"),
      icon: UserPlus,
      bg: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    },
    {
      label: "Tasa de canje",
      value: `${summary.redemptionRate.toFixed(1)}%`,
      icon: Percent,
      bg: "bg-orange-50 text-accent dark:bg-orange-950/50 dark:text-orange-400",
    },
    {
      label: "Premios canjeados",
      value: summary.rewardsRedeemed.toLocaleString("es-PE"),
      icon: Award,
      bg: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400",
    },
    {
      label: "Promedio visitas/cliente",
      value: summary.avgVisitsPerClient.toFixed(1),
      icon: Zap,
      bg: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400",
    },
  ]
}

export function KpiCards({ summary, points }: Props) {
  const kpis = points ? buildPointsKpis(summary, points) : buildKpis(summary)

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                <kpi.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-foreground">{kpi.value}</div>
            {(kpi.delta !== undefined || kpi.hint) && (
              <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
                {kpi.delta !== undefined && kpi.delta !== null && (
                  <span
                    className={`font-semibold tabular-nums ${kpi.delta >= 0 ? "text-emerald-600" : "text-red-500"}`}
                  >
                    {kpi.delta >= 0 ? "+" : ""}
                    {kpi.delta}%
                  </span>
                )}
                {kpi.hint && <span>{kpi.hint}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
