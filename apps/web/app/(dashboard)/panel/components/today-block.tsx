import Link from "next/link"

import { type ChipTone, Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import type { TodayItems } from "@/lib/dashboard/compute-dashboard"
import type { PointsDashboardState } from "@/lib/dashboard/compute-points-dashboard"
import { formatDateTime } from "@/lib/format-date"
import { cn } from "@/lib/utils"

type Props = {
  items: TodayItems
  timezone: string
  /** Present for points programs: adds the points-specific rows. */
  points?: PointsDashboardState
}

type Row = {
  key: string
  tone: ChipTone
  text: React.ReactNode
  href: string
  cta: string
}

const DOT: Record<ChipTone, string> = {
  ok: "bg-ent-ok",
  info: "bg-ent-info",
  warn: "bg-ent-warn",
  bad: "bg-ent-bad",
  mute: "bg-ent-fg-3",
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many
}

/**
 * "Para hoy": what deserves an action today, each row linking to the screen
 * where that action is taken. Rows only appear when there is something to do;
 * an empty list is good news and says so.
 */
export function TodayBlock({ items, timezone, points }: Props) {
  const rows: Row[] = []

  if (points?.policy && points.expiringSoon.clients > 0) {
    rows.push({
      key: "points-expiring",
      tone: "warn",
      text: (
        <>
          <strong>{points.expiringSoon.points}</strong> puntos de{" "}
          <strong>{points.expiringSoon.clients}</strong>{" "}
          {plural(points.expiringSoon.clients, "cliente vencen", "clientes vencen")} en los próximos
          7 días
        </>
      ),
      href: "/panel/campanas/automatizadas",
      cta: points.warningEnabled ? "Ver aviso" : "Activar aviso",
    })
  }

  if (points?.policy && !points.warningEnabled) {
    rows.push({
      key: "points-warning-off",
      tone: "mute",
      text: (
        <>
          Tus puntos vencen ({points.policy.toLowerCase()}) pero el aviso automático está{" "}
          <strong>apagado</strong>
        </>
      ),
      href: "/panel/campanas/automatizadas",
      cta: "Activar",
    })
  }

  if (points && points.canRedeem > 0 && points.cheapestCost !== null) {
    rows.push({
      key: "points-can-redeem",
      tone: "ok",
      text: (
        <>
          <strong>{points.canRedeem}</strong>{" "}
          {plural(points.canRedeem, "cliente ya puede", "clientes ya pueden")} canjear un premio (
          {points.cheapestCost} pts o más)
        </>
      ),
      href: "/panel/clientes",
      cta: "Ver clientes",
    })
  }

  if (items.atRiskClients > 0) {
    rows.push({
      key: "risk",
      tone: "bad",
      text: (
        <>
          <strong>{items.atRiskClients}</strong>{" "}
          {plural(items.atRiskClients, "cliente frecuente dejó", "clientes frecuentes dejaron")} de
          venir
        </>
      ),
      href: "/panel/campanas",
      cta: "Enviar mensaje",
    })
  }

  if (items.rewardsExpiringSoon > 0) {
    rows.push({
      key: "expiring",
      tone: "warn",
      text: (
        <>
          <strong>{items.rewardsExpiringSoon}</strong>{" "}
          {plural(items.rewardsExpiringSoon, "premio vence", "premios vencen")} en los próximos 7
          días
          {items.rewardsPending > items.rewardsExpiringSoon && (
            <span className="text-ent-fg-3"> · {items.rewardsPending} pendientes en total</span>
          )}
        </>
      ),
      href: "/panel/clientes?pendingReward=1",
      cta: "Ver quiénes",
    })
  } else if (items.rewardsPending > 0) {
    rows.push({
      key: "pending",
      tone: "mute",
      text: (
        <>
          <strong>{items.rewardsPending}</strong>{" "}
          {plural(items.rewardsPending, "premio pendiente", "premios pendientes")} de canje
        </>
      ),
      href: "/panel/clientes?pendingReward=1",
      cta: "Ver quiénes",
    })
  }

  for (const c of items.scheduledCampaigns) {
    rows.push({
      key: `camp-${c.id}`,
      tone: "info",
      text: (
        <>
          Campaña <strong>{c.name}</strong> programada para{" "}
          {formatDateTime(c.scheduledAt, timezone)}
        </>
      ),
      href: "/panel/campanas",
      cta: "Ver campaña",
    })
  }

  if (items.newClientsWithoutVisit > 0) {
    rows.push({
      key: "new",
      tone: "info",
      text: (
        <>
          <strong>{items.newClientsWithoutVisit}</strong>{" "}
          {plural(items.newClientsWithoutVisit, "cliente nuevo", "clientes nuevos")} de esta semana
          todavía no {plural(items.newClientsWithoutVisit, "visitó", "visitaron")}
        </>
      ),
      href: "/panel/clientes?segment=nuevo",
      cta: "Ver nuevos",
    })
  }

  if (items.idleCashiers.length > 0) {
    const names = items.idleCashiers.map((c) => c.name).join(", ")
    rows.push({
      key: "cashiers",
      tone: "mute",
      text: (
        <>
          Sin visitas registradas en 7 días: <strong>{names}</strong>
        </>
      ),
      href: "/panel/cajeros",
      cta: "Ver equipo",
    })
  }

  return (
    <Panel className="h-full flex flex-col">
      <PanelHeader
        title="Para hoy"
        actions={
          rows.length > 0 ? (
            <span className="text-[11.5px] text-ent-fg-3 tabular-nums">
              {rows.length} {plural(rows.length, "pendiente", "pendientes")}
            </span>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <PanelMessage className="flex-1 py-8">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ent-ok shrink-0" aria-hidden="true" />
            Todo en orden. Nada pendiente para hoy.
          </span>
        </PanelMessage>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center gap-2.5 px-3 py-2 border-b border-ent-line last:border-b-0 text-[12.5px] leading-snug"
            >
              <span
                className={cn("w-2 h-2 rounded-full shrink-0", DOT[row.tone])}
                aria-hidden="true"
              />
              <p className="flex-1 min-w-0 text-ent-fg-2 [&_strong]:text-ent-fg [&_strong]:font-semibold">
                {row.text}
              </p>
              <Link
                href={row.href}
                className="shrink-0 text-[12px] font-medium text-ent-accent hover:underline whitespace-nowrap"
              >
                {row.cta} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
