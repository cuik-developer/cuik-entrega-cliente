"use client"

import {
  APPLE_REMOVAL_TRACKING_SINCE_LABEL,
  CHURN_HELP,
  CHURN_LABEL,
  formatChurnRate,
  type PassChurn,
} from "@/lib/wallet/pass-churn"

export type TenantHealth = {
  lastVisitAt: string | null
  visits30d: number
  newClients30d: number
  installed: number
  removedPasses?: number
  churn?: PassChurn
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
        <div className="text-xs text-ent-fg-2">{last}</div>
        <div className="text-[11px] text-ent-fg-3 tabular-nums">
          +{health.newClients30d} nuevos · {health.visits30d} visitas · {health.installed} pases
          {health.removedPasses ? ` · ${health.removedPasses} eliminadas` : ""}
        </div>
      </div>
    </div>
  )
}

/** "Tasa de eliminación de tarjetas: X% (Y eliminadas de Z)" for the tenant detail. */
export function TenantChurnLine({ churn }: { churn: PassChurn }) {
  const base = churn.installed + churn.removed
  return (
    <div className="text-[12.5px] text-ent-fg-2" title={CHURN_HELP}>
      {CHURN_LABEL}:{" "}
      <strong className="tabular-nums text-ent-fg">{formatChurnRate(churn.rate)}</strong>
      {base > 0 && (
        <span className="tabular-nums text-ent-fg-3">
          {" "}
          ({churn.removed} eliminadas de {base}) · 30 días: {formatChurnRate(churn.rate30d)}
        </span>
      )}
      <p className="text-[11px] text-ent-fg-3">
        {CHURN_HELP} Apple: medido desde el {APPLE_REMOVAL_TRACKING_SINCE_LABEL}.
      </p>
    </div>
  )
}
