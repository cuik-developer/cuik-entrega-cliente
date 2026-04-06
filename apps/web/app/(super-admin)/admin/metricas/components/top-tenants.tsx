"use client"

import type { TopTenant } from "../actions"

export function TopTenants({ data }: { data: TopTenant[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <p className="text-sm text-slate-400">Sin datos de comercios</p>
      </div>
    )
  }

  const maxVisits = data[0]?.visitCount || 1

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-700">
        Top {data.length} comercios por visitas (30d)
      </h3>
      <div className="space-y-3">
        {data.map((t, i) => {
          const pct = maxVisits > 0 ? (t.visitCount / maxVisits) * 100 : 0
          return (
            <div key={t.tenantName} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs font-bold tabular-nums text-slate-400">
                #{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-slate-800">{t.tenantName}</span>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <span className="text-xs text-slate-400">
                      {t.clientCount.toLocaleString("es-PE")} clientes
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {t.visitCount.toLocaleString("es-PE")}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: "var(--color-primary)",
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
