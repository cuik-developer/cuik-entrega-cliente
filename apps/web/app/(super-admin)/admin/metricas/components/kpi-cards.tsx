"use client"

import { Building2, CreditCard, Eye, Users } from "lucide-react"

import type { PlatformSummary } from "../actions"

const kpis = [
  {
    key: "totalTenants" as const,
    label: "Comercios activos",
    icon: Building2,
    format: (v: number) => v.toLocaleString("es-PE"),
  },
  {
    key: "totalClients" as const,
    label: "Clientes totales",
    icon: Users,
    format: (v: number) => v.toLocaleString("es-PE"),
  },
  {
    key: "totalVisits30d" as const,
    label: "Visitas (30d)",
    icon: Eye,
    format: (v: number) => v.toLocaleString("es-PE"),
  },
  {
    key: "totalPlans" as const,
    label: "Planes disponibles",
    icon: CreditCard,
    format: (v: number) => v.toString(),
  },
]

export function KpiCards({ data }: { data: PlatformSummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map(({ key, label, icon: Icon, format }) => (
        <div
          key={key}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">
              {format(data[key])}
            </p>
            <p className="text-xs font-medium text-slate-500">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
