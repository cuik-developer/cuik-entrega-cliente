import {
  AlertTriangle,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Gift,
  Hourglass,
  Sparkles,
  UserX,
} from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TodayItems } from "@/lib/dashboard/compute-dashboard"
import type { PointsDashboardState } from "@/lib/dashboard/compute-points-dashboard"
import { formatDateTime } from "@/lib/format-date"

type Props = {
  items: TodayItems
  timezone: string
  /** Present for points programs: adds the points-specific rows. */
  points?: PointsDashboardState
}

type Row = {
  key: string
  icon: typeof AlertTriangle
  tone: string
  text: React.ReactNode
  href: string
  cta: string
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

  if (points && points.policy && points.expiringSoon.clients > 0) {
    rows.push({
      key: "points-expiring",
      icon: Hourglass,
      tone: "bg-amber-50 text-amber-600",
      text: (
        <>
          <strong>{points.expiringSoon.points}</strong> puntos de{" "}
          <strong>{points.expiringSoon.clients}</strong>{" "}
          {plural(points.expiringSoon.clients, "cliente vencen", "clientes vencen")} en los próximos
          7 días
        </>
      ),
      href: "/panel/campanas",
      cta: points.warningEnabled ? "Ver aviso" : "Activar aviso",
    })
  }

  if (points && points.policy && !points.warningEnabled) {
    rows.push({
      key: "points-warning-off",
      icon: BellOff,
      tone: "bg-slate-100 text-slate-500",
      text: (
        <>
          Tus puntos vencen ({points.policy.toLowerCase()}) pero el aviso automático está{" "}
          <strong>apagado</strong>
        </>
      ),
      href: "/panel/campanas",
      cta: "Activar",
    })
  }

  if (points && points.canRedeem > 0 && points.cheapestCost !== null) {
    rows.push({
      key: "points-can-redeem",
      icon: Gift,
      tone: "bg-emerald-50 text-emerald-600",
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
      icon: AlertTriangle,
      tone: "bg-orange-50 text-orange-600",
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
      icon: Gift,
      tone: "bg-amber-50 text-amber-600",
      text: (
        <>
          <strong>{items.rewardsExpiringSoon}</strong>{" "}
          {plural(items.rewardsExpiringSoon, "premio vence", "premios vencen")} en los próximos 7
          días
          {items.rewardsPending > items.rewardsExpiringSoon && (
            <span className="text-slate-400"> · {items.rewardsPending} pendientes en total</span>
          )}
        </>
      ),
      href: "/panel/clientes?pendingReward=1",
      cta: "Ver quiénes",
    })
  } else if (items.rewardsPending > 0) {
    rows.push({
      key: "pending",
      icon: Gift,
      tone: "bg-slate-100 text-slate-500",
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
      icon: CalendarClock,
      tone: "bg-blue-50 text-primary",
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
      icon: Sparkles,
      tone: "bg-sky-50 text-sky-600",
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
      icon: UserX,
      tone: "bg-slate-100 text-slate-500",
      text: (
        <>
          Sin visitas registradas en 7 días: <strong>{names}</strong>
        </>
      ),
      href: "/panel/cajeros",
      cta: "Ver cajeros",
    })
  }

  return (
    <Card className="border border-slate-200 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-700">Para hoy</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-500">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            Todo en orden. Nada pendiente para hoy.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center gap-3 py-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${row.tone}`}
                >
                  <row.icon className="w-4 h-4" />
                </div>
                <p className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">{row.text}</p>
                <Link
                  href={row.href}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                >
                  {row.cta} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
