"use client"

import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

/** Lifecycle funnel: from request to a business that really uses Cuik. Not period-scoped. */
export function PlatformFunnel({ funnel }: { funnel: PlatformMetrics["funnel"] }) {
  const steps = [
    { label: "Solicitudes recibidas", value: funnel.requests, hint: "todo el histórico" },
    { label: "Aprobadas", value: funnel.approved, hint: "convertidas en comercio" },
    {
      label: "Con su primer cliente",
      value: funnel.withFirstClient,
      hint:
        funnel.avgDaysToFirstClient !== null
          ? `en promedio ${funnel.avgDaysToFirstClient} días tras el alta`
          : "activos y demos",
    },
    {
      label: "Con 10+ clientes",
      value: funnel.withTenClients,
      hint:
        funnel.avgDaysFirstToTen !== null
          ? `en promedio ${funnel.avgDaysFirstToTen} días desde el primero`
          : "ya con base propia",
    },
    {
      label: "Con visitas esta semana",
      value: funnel.activeThisWeek,
      hint: "uso real, últimos 7 días",
    },
  ]
  const base = steps[0].value || 1
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-700">De solicitud a comercio que usa Cuik</h3>
        <p className="text-xs text-slate-400">
          Dónde se cae un comercio nuevo. No depende del rango de fechas.
        </p>
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : 0
          const conv = prev > 0 ? Math.round((s.value / prev) * 100) : null
          const width = Math.max((s.value / base) * 100, s.value > 0 ? 3 : 0)
          return (
            <li key={s.label}>
              <div className="flex items-baseline justify-between text-xs mb-1 gap-2">
                <span className="font-medium text-slate-800">{s.label}</span>
                <span className="tabular-nums text-slate-500">
                  <span className="font-bold text-slate-900">{s.value}</span>
                  {conv !== null && (
                    <span className="ml-2 text-[11px]">({conv}% del paso anterior)</span>
                  )}
                </span>
              </div>
              <div className="h-4 w-full rounded bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${width}%`,
                    backgroundColor: `color-mix(in srgb, #0e70db ${100 - i * 15}%, transparent)`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{s.hint}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
