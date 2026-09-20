"use client"

import { Activity, Award, Smartphone, UserPlus } from "lucide-react"
import Link from "next/link"

import type { PlatformActivity } from "../actions"

function daysAgo(iso: string | null): string {
  if (!iso) return "nunca"
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return "hoy"
  if (d === 1) return "ayer"
  return `hace ${d} dias`
}

/**
 * Whether the platform is growing or cooling down: tenants that actually
 * registered visits, installs, redemptions, and the tenants that went quiet.
 */
export function ActivityPanel({
  data,
  totalTenants,
}: {
  data: PlatformActivity
  totalTenants: number
}) {
  const tiles = [
    {
      icon: Activity,
      label: "Comercios con visitas",
      value: `${data.activeTenants7d} / ${data.activeTenants30d}`,
      hint: `en 7 dias / en 30 dias${totalTenants ? ` · de ${totalTenants} activos` : ""}`,
    },
    {
      icon: Smartphone,
      label: "Pases instalados (Apple)",
      value: `${data.passesInstalled7d} / ${data.passesInstalled30d}`,
      hint: "en 7 dias / en 30 dias",
    },
    {
      icon: Award,
      label: "Canjes (30d)",
      value: data.redemptions30d.toLocaleString("es-PE"),
      hint: "premios de sellos + canjes de puntos",
    },
    {
      icon: UserPlus,
      label: "Clientes nuevos (30d)",
      value: data.newClients30d.toLocaleString("es-PE"),
      hint: "en toda la plataforma",
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <t.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                {t.value}
              </p>
              <p className="text-xs font-medium text-slate-500">{t.label}</p>
              <p className="text-[11px] text-slate-400">{t.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-700">Comercios sin visitas en 14 dias</h3>
          <span className="text-xs text-slate-400">
            En demo o activos, con clientes registrados. Son los que hay que llamar.
          </span>
        </div>
        {data.inactiveTenants.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Todos los comercios con clientes registraron visitas en las ultimas dos semanas.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.inactiveTenants.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link
                    href={`/admin/tenants?q=${encodeURIComponent(t.name)}`}
                    className="font-medium text-slate-900 hover:text-[#0e70db]"
                  >
                    {t.name}
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">{t.slug}</span>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  <span className={t.lastVisitAt ? "" : "text-red-500 font-medium"}>
                    ultima visita {daysAgo(t.lastVisitAt)}
                  </span>
                  <span className="ml-2 text-slate-400">· {t.clients} clientes</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
