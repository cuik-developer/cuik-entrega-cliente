"use client"

import type { AnalyticsSummary } from "@cuik/shared/types/analytics"
import { Award, Percent, TrendingUp, UserPlus, Users, Zap } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

type Props = {
  summary: AnalyticsSummary
}

type KpiItem = {
  label: string
  value: string
  icon: typeof TrendingUp
  bg: string
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

export function KpiCards({ summary }: Props) {
  const kpis = buildKpis(summary)

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
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
