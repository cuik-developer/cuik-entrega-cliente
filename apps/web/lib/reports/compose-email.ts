import type { ReportePeriodicoProps, ReportSectionProps } from "@cuik/email"
import type { ReportData } from "./compute-report"
import { buildInsights, insightLine } from "./insights"
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

  const team = teamItems(data, isWeekly)

  // Top 4, and only the ones worth opening the email with (score >= 30).
  const insights = buildInsights(data, 4, 30).map(insightLine)

  const depth = depthItems(data, isWeekly)

  const sections: ReportSectionProps[] = [
    ...(insights.length > 0 ? [{ title: "Lo más importante", items: insights }] : []),
    { title: "Lo que pasó", items: happened },
    ...(depth.length > 0 ? [{ title: "Cómo se comportan tus clientes", items: depth }] : []),
    ...(team.length > 0 ? [{ title: "Tus sucursales y cajeros", items: team }] : []),
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
    settingsHint: `Recibes este correo porque el reporte ${isWeekly ? "semanal" : "mensual"} está activado en Analítica → Reportes por correo. Podés cambiar el día, la hora, los destinatarios o desactivarlo desde ahí.`,
  }
}

export function happenedItems(data: ReportData, here: string): string[] {
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

/** The six depth KPIs in words: habit, value and funnel. Empty when there were no visits. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: six independent sentences, each guarded by its own data check
export function depthItems(data: ReportData, isWeekly: boolean): string[] {
  const d = data.signals.depth
  const here = isWeekly ? "esta semana" : "este mes"
  const items: string[] = []
  if (data.kpis.uniqueClients.current === 0) return items

  const freqDelta =
    d.frequency.previous > 0 ? ` (${data.compareLabel}: ${d.frequency.previous})` : ""
  items.push(
    `Cada cliente vino en promedio ${d.frequency.current} ${d.frequency.current === 1 ? "vez" : "veces"} ${here}${freqDelta}.` +
      (d.medianDaysBetween != null
        ? ` Entre una visita y la siguiente pasan ${d.medianDaysBetween} días (mediana).`
        : ""),
  )

  const unique = data.kpis.uniqueClients.current
  const returning = data.signals.returningClients
  if (unique > 0) {
    items.push(
      `Tasa de retorno: ${Math.round((returning / unique) * 100)} % de los que vinieron ya te conocían (${returning} de ${unique}); ${plural(data.signals.newVisitors, "era primerizo", "eran primerizos")}.`,
    )
  }

  if (d.secondVisit.cohort > 0) {
    items.push(
      `Segunda visita: de ${plural(d.secondVisit.cohort, "cliente que empezó", "clientes que empezaron")} hace uno o dos meses, ${d.secondVisit.pct} % volvió dentro de los 30 días siguientes.`,
    )
  }

  const f = d.funnel
  if (f.registered > 0) {
    const p = (n: number) => Math.round((n / f.registered) * 100)
    let line = `Embudo: ${plural(f.registered, "registrado", "registrados")}, ${p(f.withVisit)} % con al menos una visita, ${p(f.repeaters)} % volvieron dos o más veces y ${p(f.redeemers)} % ya ${data.tenant.programType === "points" ? "canjearon puntos" : "cobraron un premio"}.`
    if (f.newRegistered > 0) {
      line += ` De ${plural(f.newRegistered, "nuevo", "nuevos")} ${here}, ${f.newWithVisit} ya ${f.newWithVisit === 1 ? "visitó" : "visitaron"} y ${f.newRepeaters} ${f.newRepeaters === 1 ? "volvió" : "volvieron"}.`
    }
    items.push(line)
  }

  const rewards = data.signals.topRewards.filter((x) => x.redemptions > 0)
  if (rewards.length > 0) {
    const top = rewards
      .slice(0, 3)
      .map((x) => `${x.name} (${x.redemptions})`)
      .join(", ")
    items.push(`Premios más canjeados ${here}: ${top}${rewards.length > 3 ? " y más" : ""}.`)
  }

  const moved = data.signals.segments
    .filter((x) => x.count !== x.previous && (x.count >= 3 || x.previous >= 3))
    .sort((a, b) => Math.abs(b.count - b.previous) - Math.abs(a.count - a.previous))
    .slice(0, 3)
  if (moved.length > 0) {
    items.push(
      `Segmentos que se movieron: ${moved.map((x) => `${x.label} ${x.previous} → ${x.count}`).join(", ")}.`,
    )
  }

  if (d.timeToFirstReward.medianDays != null && d.timeToFirstReward.clients >= 3) {
    items.push(
      `Del registro al primer ${data.tenant.programType === "points" ? "canje" : "premio"} pasan ${d.timeToFirstReward.medianDays} días (mediana sobre ${d.timeToFirstReward.clients} clientes).`,
    )
  }

  if (d.ticket.current != null && d.ticket.visitsWithAmount >= 3) {
    const prev =
      d.ticket.previous != null ? ` (${data.compareLabel}: S/ ${d.ticket.previous.toFixed(2)})` : ""
    items.push(
      `Ticket promedio: S/ ${d.ticket.current.toFixed(2)} sobre ${plural(d.ticket.visitsWithAmount, "compra con monto", "compras con monto")}${prev}.`,
    )
  }
  return items
}

/** Branch and cashier highlights; empty when the tenant has a single branch and cashier. */
export function teamItems(data: ReportData, isWeekly: boolean): string[] {
  const items: string[] = []
  const here = isWeekly ? "esta semana" : "este mes"
  const { branches, cashiers, showBranches, showCashiers } = data.team

  if (showBranches) {
    const real = branches.filter((b) => b.id !== null)
    const withVisits = real.filter((b) => b.visits > 0)
    if (withVisits.length > 0) {
      const best = withVisits[0]
      const worst = real[real.length - 1]
      let line = `Sede más fuerte: ${best.name} con ${plural(best.visits, "visita", "visitas")} (${best.share} % del total, ${deltaShort(best.visits, best.previousVisits)} vs. ${data.compareLabel}).`
      if (worst.id !== best.id) {
        line +=
          worst.visits === 0
            ? ` ${worst.name} no registró ninguna visita ${here}.`
            : ` La más floja: ${worst.name} con ${plural(worst.visits, "visita", "visitas")} (${deltaShort(worst.visits, worst.previousVisits)}).`
      }
      items.push(line)
    } else {
      items.push(`Ninguna sucursal registró visitas ${here}.`)
    }
    const none = branches.find((b) => b.id === null)
    if (none && none.visits > 0) {
      items.push(
        `${plural(none.visits, "visita quedó", "visitas quedaron")} sin sucursal asignada: son anteriores a la creación de tus sedes o se registraron fuera de la caja. No cuentan en el reparto por sucursal.`,
      )
    }
  }

  if (showCashiers) {
    const idle = cashiers.filter((c) => c.role === "Cajero" && c.visits === 0)
    const active = cashiers.filter((c) => c.visits > 0)
    if (active.length > 0) {
      const top = active[0]
      items.push(
        `Cajero más activo: ${top.name} con ${plural(top.visits, "visita", "visitas")} en ${plural(top.activeDays, "día", "días")} (${top.perActiveDay} por día).`,
      )
    }
    if (idle.length > 0) {
      const names = idle
        .slice(0, 4)
        .map((c) => c.name)
        .join(", ")
      items.push(
        `${plural(idle.length, "cajero no registró", "cajeros no registraron")} ninguna visita ${here}: ${names}${idle.length > 4 ? " y más" : ""}. Suele ser señal de que no están ofreciendo el programa en caja; el detalle está en la hoja "Cajeros" del Excel.`,
      )
    } else if (active.length > 0) {
      items.push(`Todos los cajeros registraron visitas ${here}.`)
    }
  }

  return items
}

export function loyalItems(data: ReportData): string[] {
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

export function actItems(data: ReportData, isWeekly: boolean): string[] {
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
