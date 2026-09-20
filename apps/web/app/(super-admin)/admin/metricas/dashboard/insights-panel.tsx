"use client"

import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Lightbulb } from "lucide-react"
import Link from "next/link"
import type { Insight } from "@/lib/admin/platform-metrics"

const META = {
  critical: {
    icon: AlertOctagon,
    cls: "border-red-200 bg-red-50 text-red-800",
    iconCls: "text-red-500",
  },
  warning: {
    icon: AlertTriangle,
    cls: "border-amber-200 bg-amber-50 text-amber-900",
    iconCls: "text-amber-500",
  },
  info: {
    icon: Lightbulb,
    cls: "border-blue-200 bg-blue-50 text-blue-900",
    iconCls: "text-blue-500",
  },
  positive: {
    icon: CheckCircle2,
    cls: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconCls: "text-emerald-500",
  },
} as const

/** Plain-language observations derived from the filtered data, each with a way to act on it. */
export function InsightsPanel({
  insights,
  onFocusTenants,
}: {
  insights: Insight[]
  onFocusTenants: (ids: string[]) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-700">Qué está pasando</h3>
        <span className="text-xs text-slate-400">
          Reglas sobre los datos del filtro. Ordenado por urgencia.
        </span>
      </div>
      <ul className="space-y-2">
        {insights.map((i, idx) => {
          const m = META[i.severity]
          return (
            <li
              key={`${i.severity}-${idx}-${i.text.slice(0, 20)}`}
              className={`rounded-lg border px-3 py-2.5 text-sm flex items-start gap-2.5 ${m.cls}`}
            >
              <m.icon className={`w-4 h-4 mt-0.5 shrink-0 ${m.iconCls}`} />
              <span className="flex-1">{i.text}</span>
              <span className="flex items-center gap-2 shrink-0">
                {i.tenantIds && i.tenantIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onFocusTenants(i.tenantIds ?? [])}
                    className="text-xs font-semibold underline-offset-2 hover:underline"
                  >
                    Ver en la tabla
                  </button>
                )}
                {i.href && (
                  <Link
                    href={i.href}
                    className="text-xs font-semibold inline-flex items-center gap-0.5 hover:underline"
                  >
                    Abrir <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
