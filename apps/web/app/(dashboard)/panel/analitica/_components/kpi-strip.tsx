"use client"

import type { AnalyticsSummary, PointsAnalytics } from "@cuik/shared/types/analytics"

import { Panel } from "@/components/admin/enterprise"
import { cn } from "@/lib/utils"

type Props = {
  summary: AnalyticsSummary
  /** When present (points programs) the redemption KPIs are replaced by points KPIs. */
  points?: PointsAnalytics["kpis"] | null
}

type Kpi = {
  label: string
  value: string
  /** Change against the previous period, when it makes sense. */
  delta?: number | null
  hint?: string
}

const fmt = (v: number) => v.toLocaleString("es-PE")

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function buildPointsKpis(summary: AnalyticsSummary, p: PointsAnalytics["kpis"]): Kpi[] {
  return [
    { label: "Visitas", value: fmt(summary.totalVisits) },
    { label: "Clientes nuevos", value: fmt(summary.newClients) },
    {
      label: "Puntos otorgados",
      value: fmt(p.earned),
      delta: deltaPct(p.earned, p.earnedPrev),
      hint: `${fmt(p.earnedPrev)} período anterior`,
    },
    {
      label: "Puntos canjeados",
      value: fmt(p.redeemed),
      delta: deltaPct(p.redeemed, p.redeemedPrev),
      hint: `${fmt(p.redeemedPrev)} período anterior`,
    },
    { label: "Puntos vigentes", value: fmt(p.outstanding), hint: "saldo total de tus clientes" },
    {
      label: "Ticket promedio",
      value: p.avgTicket === null ? "—" : `S/ ${p.avgTicket.toFixed(2)}`,
      hint: p.ticketCount > 0 ? `${fmt(p.ticketCount)} compras` : undefined,
    },
  ]
}

function buildKpis(summary: AnalyticsSummary): Kpi[] {
  return [
    { label: "Visitas", value: fmt(summary.totalVisits) },
    { label: "Clientes que visitaron", value: fmt(summary.uniqueClients) },
    { label: "Clientes nuevos", value: fmt(summary.newClients) },
    { label: "Premios canjeados", value: fmt(summary.rewardsRedeemed) },
    {
      label: "Tasa de canje",
      value: `${summary.redemptionRate.toFixed(1)}%`,
      hint: "premios canjeados / generados",
    },
    { label: "Visitas por cliente", value: summary.avgVisitsPerClient.toFixed(1) },
  ]
}

/**
 * Same anatomy as the enterprise `StatStrip` (figures separated by lines, no
 * icons), but six cells: 2 per row on phones, 3 on tablets, one row on desktop.
 */
export function KpiStrip({ summary, points }: Props) {
  const kpis = points ? buildPointsKpis(summary, points) : buildKpis(summary)
  return (
    <Panel className="overflow-hidden">
      {/* Every cell draws its right and bottom line; the outer ones fall under the panel border. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 -mr-px -mb-px">
        {kpis.map((k) => (
          <div key={k.label} className="px-3 py-2 min-w-0 border-r border-b border-ent-line">
            <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 truncate">
              {k.label}
            </div>
            <div className="text-[18px] leading-6 font-semibold text-ent-fg tabular-nums truncate">
              {k.value}
              {k.delta !== undefined && k.delta !== null && (
                <span
                  className={cn(
                    "text-[11px] font-medium ml-1.5 tabular-nums",
                    k.delta > 0 ? "text-ent-ok" : k.delta < 0 ? "text-ent-bad" : "text-ent-fg-3",
                  )}
                >
                  {k.delta > 0 ? "▲ " : k.delta < 0 ? "▼ " : ""}
                  {Math.abs(k.delta)}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-ent-fg-3 truncate min-h-4">{k.hint ?? ""}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
