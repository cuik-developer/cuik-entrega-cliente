"use client"

export type TenantHealth = {
  lastVisitAt: string | null
  visits30d: number
  newClients30d: number
  installed: number
}

export type HealthLevel = "good" | "warn" | "bad" | "none"

/**
 * green: a visit in the last 7 days · amber: in the last 30 · red: nothing
 * in 30 days (or never, with clients) · grey: no clients yet.
 */
export function healthLevel(h: TenantHealth, clientCount: number): HealthLevel {
  if (clientCount === 0 && !h.lastVisitAt) return "none"
  if (!h.lastVisitAt) return "bad"
  const days = (Date.now() - new Date(h.lastVisitAt).getTime()) / 86_400_000
  if (days <= 7) return "good"
  if (days <= 30) return "warn"
  return "bad"
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const DOT: Record<HealthLevel, { cls: string; label: string }> = {
  good: { cls: "bg-emerald-500", label: "Activo esta semana" },
  warn: { cls: "bg-amber-400", label: "Sin visitas hace mas de 7 dias" },
  bad: { cls: "bg-red-500", label: "Sin visitas hace mas de 30 dias" },
  none: { cls: "bg-slate-300", label: "Todavia sin clientes" },
}

export function TenantHealthCell({
  health,
  clientCount,
}: {
  health: TenantHealth
  clientCount: number
}) {
  const level = healthLevel(health, clientCount)
  const days = daysSince(health.lastVisitAt)
  const last =
    days === null
      ? "sin visitas"
      : days === 0
        ? "visita hoy"
        : days === 1
          ? "ayer"
          : `hace ${days} d`
  return (
    <div className="flex items-start gap-2" title={DOT[level].label}>
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[level].cls}`} />
      <div className="leading-tight">
        <div className="text-xs text-slate-700">{last}</div>
        <div className="text-[11px] text-slate-400 tabular-nums">
          +{health.newClients30d} nuevos · {health.visits30d} visitas · {health.installed} pases
        </div>
      </div>
    </div>
  )
}
