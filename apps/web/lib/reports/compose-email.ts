import type { ReportePeriodicoProps, ReportSectionProps } from "@cuik/email"
import type { ReportData } from "./compute-report"
import { type Delta, dayLabel, deltaShort } from "./period"

/**
 * Turns report data into the words of the email: subject, preview, KPI tiles
 * and the bullet sections. Pure, so it is unit-tested without a database.
 */

function arrow(d: Delta): string {
  return d.direction === "up" ? "▲ " : d.direction === "down" ? "▼ " : ""
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function reportSubject(data: ReportData): string {
  const v = data.kpis.visits
  const change = deltaShort(v.current, v.previous)
  if (data.kind === "weekly") {
    return `${data.tenant.name}: ${plural(v.current, "visita", "visitas")} esta semana (${change})`
  }
  const month = data.periodLabel.split(" de ")[0]
  return `${data.tenant.name} en ${month}: ${plural(v.current, "visita", "visitas")} (${change})`
}

export function reportPreview(data: ReportData): string {
  const parts = [
    plural(data.kpis.newClients.current, "cliente nuevo", "clientes nuevos"),
    plural(data.kpis.rewardsRedeemed.current, "premio canjeado", "premios canjeados"),
  ]
  if (data.birthdays.length > 0)
    parts.push(plural(data.birthdays.length, "cumpleaños", "cumpleaños"))
  const when = data.kind === "weekly" ? "esta semana" : "este mes"
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]} ${when}`
}

export function composeReportEmail(
  data: ReportData,
  urls: { panel: string; campaigns: string; clientsAtRisk: string },
): ReportePeriodicoProps {
  const isWeekly = data.kind === "weekly"
  const here = isWeekly ? "esta semana" : "este mes"
  const rewardsWord =
    data.tenant.programType === "points" ? "Canjes de puntos" : "Premios canjeados"

  const kpis: ReportePeriodicoProps["kpis"] = [
    kpiTile("Visitas", data.kpis.visits),
    kpiTile("Clientes nuevos", data.kpis.newClients),
    kpiTile(rewardsWord, data.kpis.rewardsRedeemed),
  ]

  const happened = happenedItems(data, here)

  const loyal = loyalItems(data)

  const act = actItems(data, isWeekly)

  const sections: ReportSectionProps[] = [
    { title: "Lo que pasó", items: happened },
    {
      title: isWeekly ? "Tus clientes más fieles de la semana" : "Tus clientes más fieles del mes",
      items: loyal,
    },
    {
      title: isWeekly ? "Para actuar esta semana" : "Para actuar este mes",
      items: act,
      link:
        data.atRisk.length > 0
          ? { label: "Crear campaña para clientes en riesgo", href: urls.clientsAtRisk }
          : undefined,
    },
  ]

  if (data.monthly)
    sections.push({ title: "Desde que empezaste", items: cumulativeItems(data.monthly.cumulative) })

  const attachmentName = `${data.tenant.slug}-${isWeekly ? "semana" : "mes"}-${data.period.key}.xlsx`
  const heading = isWeekly
    ? `Tu semana en ${data.tenant.name}`
    : `${capitalize(data.periodLabel.split(" de ")[0])} en ${data.tenant.name}`

  return {
    businessName: data.tenant.name,
    heading,
    periodLine: `${capitalize(data.periodLabel)} · comparado con ${data.compareLabel}`,
    preview: reportPreview(data),
    kpis,
    sections,
    panelUrl: urls.panel,
    attachmentName,
    settingsHint: `Recibes este correo porque el reporte ${isWeekly ? "semanal" : "mensual"} está activado en Campañas → Automatizaciones. Podés cambiar el día, la hora o desactivarlo desde ahí.`,
  }
}

function happenedItems(data: ReportData, here: string): string[] {
  const happened: string[] = []
  if (data.bestDay) {
    const worst =
      data.worstDay && data.worstDay.date !== data.bestDay.date
        ? ` El más flojo, el ${data.worstDay.weekday} ${dayLabel(data.worstDay.date).split(" de ")[0]} con ${data.worstDay.visits}.`
        : ""
    happened.push(
      `El día más fuerte fue el ${data.bestDay.weekday} ${dayLabel(data.bestDay.date).split(" de ")[0]} con ${plural(data.bestDay.visits, "visita", "visitas")}.${worst}`,
    )
  } else {
    happened.push(`No hubo visitas ${here}.`)
  }
  if (data.kpis.uniqueClients.current > 0) {
    happened.push(
      `${plural(data.kpis.uniqueClients.current, "cliente distinto te visitó", "clientes distintos te visitaron")}; ${data.repeatClients} ${data.repeatClients === 1 ? "vino" : "vinieron"} dos veces o más.`,
    )
  }
  if (data.campaigns.length > 0) {
    const total = data.campaigns.reduce((s, c) => s + c.sentCount, 0)
    const names = data.campaigns
      .slice(0, 2)
      .map((c) => `"${c.name}"`)
      .join(" y ")
    happened.push(
      `Enviaste ${plural(data.campaigns.length, "campaña push", "campañas push")} (${names}${data.campaigns.length > 2 ? " y más" : ""}) a ${plural(total, "cliente", "clientes")}.`,
    )
  }
  if (data.monthly?.weeks.length) {
    const best = data.monthly.weeks.reduce((a, b) => (b.visits > a.visits ? b : a))
    if (best.visits > 0)
      happened.push(
        `Tu mejor semana fue la ${best.label.toLowerCase()} con ${plural(best.visits, "visita", "visitas")}.`,
      )
  }
  if (data.monthly?.lastYearVisits != null) {
    happened.push(
      `El mismo mes del año pasado tuviste ${plural(data.monthly.lastYearVisits, "visita", "visitas")} (${deltaShort(data.kpis.visits.current, data.monthly.lastYearVisits)}).`,
    )
  }

  return happened
}

function loyalItems(data: ReportData): string[] {
  return data.topClients.map((c) => {
    const extra =
      data.tenant.programType === "points"
        ? c.progress
        : c.pendingReward
          ? "premio disponible sin canjear"
          : `lleva ${c.progress}`
    return `${c.name} · ${plural(c.periodVisits, "visita", "visitas")} · ${extra}`
  })
}

function actItems(data: ReportData, isWeekly: boolean): string[] {
  const act: string[] = []
  if (data.atRisk.length > 0) {
    act.push(
      `${plural(data.atRisk.length, "cliente en riesgo", "clientes en riesgo")}: solían venir seguido y dejaron de pasar. Están en la hoja "En riesgo" del Excel. Recomendación: envíales una campaña push con un motivo para volver, por ejemplo un sello extra en su próxima visita.`,
    )
  }
  if (data.actionable.count > 0) {
    act.push(
      data.tenant.programType === "points"
        ? `${plural(data.actionable.count, "cliente ya tiene", "clientes ya tienen")} saldo para canjear un premio del catálogo y no lo han usado.`
        : `${plural(data.actionable.count, "premio pendiente", "premios pendientes")} de canje: clientes que completaron la tarjeta y no han venido a cobrar.`,
    )
  }
  if (data.birthdays.length > 0) {
    const names = data.birthdays
      .slice(0, 3)
      .map((b) => `${b.name} (${b.weekday.slice(0, 3)} ${dayLabel(b.date).split(" de ")[0]})`)
      .join(", ")
    const auto = data.birthdayAutomationEnabled
      ? "El push de cumpleaños está activo, así que se envía solo."
      : "Activá el push de cumpleaños en Campañas para saludarlos automáticamente."
    act.push(
      `${plural(data.birthdays.length, "cumpleaños", "cumpleaños")} ${isWeekly ? "la semana que empieza" : "el mes que empieza"}: ${names}${data.birthdays.length > 3 ? " y más" : ""}. ${auto}`,
    )
  }

  return act
}

function cumulativeItems(c: NonNullable<ReportData["monthly"]>["cumulative"]): string[] {
  const items = [
    `Desde ${c.sinceLabel}: ${plural(c.totals.visits, "visita", "visitas")}, ${plural(c.totals.clients, "cliente registrado", "clientes registrados")} y ${plural(c.totals.rewardsRedeemed, "premio canjeado", "premios canjeados")}.`,
    `Cada cliente que te visitó al menos una vez vino en promedio ${c.totals.avgVisitsPerClient} veces.`,
  ]
  if (c.bestMonth)
    items.push(
      `Tu mejor mes fue ${c.bestMonth.label} con ${plural(c.bestMonth.visits, "visita", "visitas")}.`,
    )
  if (c.topClients.length) {
    items.push(
      `Tus 5 clientes históricos: ${c.topClients
        .slice(0, 5)
        .map((t) => `${t.name} (${t.totalVisits})`)
        .join(", ")}.`,
    )
  }

  return items
}

function kpiTile(label: string, k: ReportData["kpis"]["visits"]) {
  return {
    label,
    value: k.current,
    deltaText: `${arrow(k.delta)}${k.delta.text}`,
    direction: k.delta.direction,
  }
}
