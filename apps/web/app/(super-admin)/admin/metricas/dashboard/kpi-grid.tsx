"use client"

import {
  Award,
  Building2,
  Coins,
  Receipt,
  Repeat,
  Smartphone,
  TrendingUp,
  UserPlus,
} from "lucide-react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

type Kpi = {
  key: string
  label: string
  value: string
  delta: number | null // percent, null when not comparable
  deltaLabel?: string
  hint: string
  icon: typeof TrendingUp
  spark?: number[]
  /** For rates, show point difference instead of percent change. */
  betterWhen?: "up" | "down"
}

function deltaPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

const fmt = (v: number) => v.toLocaleString("es-PE")
const money = (v: number) =>
  `S/ ${v.toLocaleString("es-PE", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`

function Spark({ data }: { data: number[] }) {
  if (data.length < 2 || data.every((v) => v === 0)) return null
  return (
    <div className="h-7 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((v, i) => ({ i, v }))}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="#0e70db"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Six decision KPIs, each with its change against the previous period and a sparkline. */
export function KpiGrid({
  data,
  program,
}: {
  data: PlatformMetrics
  program: "all" | "stamps" | "points"
}) {
  const k = data.kpis
  const bucketed = (arr: number[]) => {
    // Compress to at most 30 points so the sparkline stays legible on long ranges.
    const step = Math.ceil(arr.length / 30)
    if (step <= 1) return arr
    const out: number[] = []
    for (let i = 0; i < arr.length; i += step)
      out.push(arr.slice(i, i + step).reduce((a, b) => a + b, 0))
    return out
  }

  const kpis: Kpi[] = [
    {
      key: "active",
      label: "Comercios con visitas",
      value: `${fmt(k.activeTenants.cur)} / ${fmt(k.scopeTenants)}`,
      delta: deltaPct(k.activeTenants.cur, k.activeTenants.prev),
      hint: "registraron al menos una visita en el período",
      icon: Building2,
    },
    {
      key: "visits",
      label: "Visitas",
      value: fmt(k.visits.cur),
      delta: deltaPct(k.visits.cur, k.visits.prev),
      hint: `${fmt(k.visits.prev)} en el período anterior`,
      icon: TrendingUp,
      spark: bucketed(data.daily.visits.cur),
    },
    {
      key: "newClients",
      label: "Clientes nuevos",
      value: fmt(k.newClients.cur),
      delta: deltaPct(k.newClients.cur, k.newClients.prev),
      hint: `${fmt(k.newClients.prev)} en el período anterior`,
      icon: UserPlus,
      spark: bucketed(data.daily.newClients.cur),
    },
    {
      key: "return",
      label: "Tasa de retorno",
      value: `${k.returnRate.cur}%`,
      delta:
        k.returnRate.prev > 0 || k.returnRate.cur > 0
          ? Math.round((k.returnRate.cur - k.returnRate.prev) * 10) / 10
          : null,
      deltaLabel: "pts",
      hint: "clientes con 2+ visitas entre los que visitaron",
      icon: Repeat,
    },
    {
      key: "install",
      label: "Instalan el pase",
      value: `${k.installRate.cur}%`,
      delta:
        k.installRate.prev > 0 || k.installRate.cur > 0
          ? Math.round((k.installRate.cur - k.installRate.prev) * 10) / 10
          : null,
      deltaLabel: "pts",
      hint: "de los clientes nuevos del período",
      icon: Smartphone,
      spark: bucketed(data.daily.installs.cur),
    },
    program === "stamps"
      ? {
          key: "redemptions",
          label: "Canjes",
          value: fmt(k.redemptions.cur),
          delta: deltaPct(k.redemptions.cur, k.redemptions.prev),
          hint: "premios entregados en el período",
          icon: Award,
          spark: bucketed(data.daily.redemptions.cur),
        }
      : {
          key: "ticket",
          label: "Ticket promedio",
          value: k.avgTicket.cur > 0 ? `S/ ${k.avgTicket.cur.toFixed(2)}` : "—",
          delta: deltaPct(k.avgTicket.cur, k.avgTicket.prev),
          hint:
            program === "points"
              ? "monto promedio por compra registrada"
              : `compras con monto · ${fmt(k.redemptions.cur)} canjes`,
          icon: Receipt,
        },
    {
      key: "mrr",
      label: "Ingreso mensual estimado",
      value: money(k.mrr.cur),
      delta: deltaPct(k.mrr.cur, k.mrr.prev),
      hint: "comercios activos × precio de su plan",
      icon: Coins,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {kpis.map((kpi) => {
        const up = kpi.delta !== null && kpi.delta > 0
        const down = kpi.delta !== null && kpi.delta < 0
        const good = kpi.betterWhen === "down" ? down : up
        const bad = kpi.betterWhen === "down" ? up : down
        return (
          <div
            key={kpi.key}
            className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col gap-2 min-w-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-500 leading-tight">
                {kpi.label}
              </span>
              <kpi.icon className="w-4 h-4 text-slate-300 shrink-0" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums leading-none">
              {kpi.value}
            </p>
            {kpi.spark && <Spark data={kpi.spark} />}
            <div className="text-[11px] leading-tight">
              {kpi.delta !== null ? (
                <span
                  className={`font-semibold tabular-nums ${good ? "text-emerald-600" : bad ? "text-red-500" : "text-slate-400"}`}
                >
                  {kpi.delta > 0 ? "+" : ""}
                  {kpi.delta}
                  {kpi.deltaLabel ? ` ${kpi.deltaLabel}` : "%"}
                </span>
              ) : (
                <span className="text-slate-300">sin base de comparación</span>
              )}
              <span className="text-slate-400"> · {kpi.hint}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
