import type { ReportData } from "./compute-report"
import { deltaShort } from "./period"

/**
 * Rule-based insights for the periodic report: deterministic, explainable,
 * ranked by impact. Each one answers "what happened → why it matters → what
 * to do" in plain Spanish. Pure: unit-tested without a database. The signals
 * it reads are computed in compute-report.ts (`data.signals`).
 */

export type InsightTone = "good" | "warn" | "info"

export type Insight = {
  key: string
  tone: InsightTone
  /** Ranking weight, higher first. */
  score: number
  title: string
  what: string
  why: string
  action: string
}

export type CampaignLift = {
  name: string
  sentCount: number
  /** Visits in the 48 h after the push. */
  visitsAfter: number
  /** Expected visits in any 48 h window of the period. */
  expected: number
  /** Percent lift vs. expected, null when there is no baseline. */
  liftPct: number | null
}

export type CohortRow = {
  /** "YYYY-MM" of registration. */
  ym: string
  label: string
  registered: number
  /** Registered that month who visited again in a later month (up to the period end). */
  returned: number
  /** returned / registered, 0-100. */
  retentionPct: number
}

export type ReportSignals = {
  /** Average of the previous periods (4 weeks / 3 months) with any activity; null when history is too short. */
  baseline: { periods: number; visits: number; newClients: number; redeemed: number } | null
  /** Unique visitors split: seen before the period vs. first-timers. */
  returningClients: number
  newVisitors: number
  peakHour: { current: string | null; previous: string | null }
  bestWeekday: { current: string | null; previous: string | null }
  campaignLift: CampaignLift[]
  /** Clients in status active/inactive at the period end. */
  activeClients: number
  points: {
    earned: number
    redeemed: number
    expired: number
    /** Open lots expiring in the 7 days after the period. */
    expiringNext: { clients: number; points: number }
    warningEnabled: boolean
  } | null
  stamps: { rewardsEarned: number; pendingTotal: number } | null
  /** Monthly only: retention of the last registration cohorts. */
  cohorts: CohortRow[]
  /** Depth KPIs: habit, value and funnel. */
  depth: DepthKpis
}

export type DepthKpis = {
  /** Visits per distinct visitor in the period (and the previous one). */
  frequency: { current: number; previous: number }
  /** Median days between consecutive visits, over the gaps that closed in the period. */
  medianDaysBetween: number | null
  /** Clients whose first visit was 30-60 days before the period end: how many came back within 30 days. */
  secondVisit: { cohort: number; returned: number; pct: number }
  /** Distinct visitors of the period by number of visits. */
  buckets: { one: number; twoThree: number; fourSeven: number; eightPlus: number }
  /** Registered → with pass → with a visit, all-time at the period end and for the period's new clients. */
  funnel: {
    registered: number
    withPass: number
    withVisit: number
    newRegistered: number
    newWithPass: number
    newWithVisit: number
  }
  /** Median days from registration to the first reward, over clients who ever redeemed. */
  timeToFirstReward: { medianDays: number | null; clients: number }
  /** Average purchase amount on visits that recorded one. */
  ticket: { current: number | null; previous: number | null; visitsWithAmount: number }
}

export const EMPTY_DEPTH: DepthKpis = {
  frequency: { current: 0, previous: 0 },
  medianDaysBetween: null,
  secondVisit: { cohort: 0, returned: 0, pct: 0 },
  buckets: { one: 0, twoThree: 0, fourSeven: 0, eightPlus: 0 },
  funnel: {
    registered: 0,
    withPass: 0,
    withVisit: 0,
    newRegistered: 0,
    newWithPass: 0,
    newWithVisit: 0,
  },
  timeToFirstReward: { medianDays: null, clients: 0 },
  ticket: { current: null, previous: null, visitsWithAmount: 0 },
}

export const EMPTY_SIGNALS: ReportSignals = {
  baseline: null,
  returningClients: 0,
  newVisitors: 0,
  peakHour: { current: null, previous: null },
  bestWeekday: { current: null, previous: null },
  campaignLift: [],
  activeClients: 0,
  points: null,
  stamps: null,
  cohorts: [],
  depth: EMPTY_DEPTH,
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function pctChange(current: number, base: number): number | null {
  if (base <= 0) return null
  return Math.round(((current - base) / base) * 100)
}

/** All insights that apply, ranked. `limit` trims for the email; `minScore` drops weak items. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat list of independent rules reads better than one function per rule
export function buildInsights(data: ReportData, limit?: number, minScore = 0): Insight[] {
  const out: Insight[] = []
  const s = data.signals
  const isWeekly = data.kind === "weekly"
  const here = isWeekly ? "esta semana" : "este mes"
  const isPoints = data.tenant.programType === "points"
  const visits = data.kpis.visits.current
  const unique = data.kpis.uniqueClients.current

  // 1. Trend vs. baseline (not just vs. last period)
  if (s.baseline && s.baseline.visits >= 10) {
    const change = pctChange(visits, s.baseline.visits)
    if (change !== null && Math.abs(change) >= 15) {
      const up = change > 0
      out.push({
        key: "trend",
        tone: up ? "good" : "warn",
        score: Math.min(100, 40 + Math.abs(change)),
        title: up
          ? `Vas ${change} % por encima de tu ritmo`
          : `Vas ${Math.abs(change)} % por debajo de tu ritmo`,
        what: `${plural(visits, "visita", "visitas")} ${here} frente a un promedio de ${s.baseline.visits} en ${isWeekly ? "las últimas 4 semanas" : "los últimos 3 meses"}.`,
        why: up
          ? "Comparar con el promedio y no solo con la semana pasada confirma que es una tendencia, no un pico."
          : "Una caída sostenida frente a tu propio promedio es la señal más temprana de que el programa pierde tracción en caja.",
        action: up
          ? "Aprovecha el impulso: es buen momento para una campaña a clientes nuevos con un incentivo para la segunda visita."
          : "Revisa la hoja de cajeros y sucursales: casi siempre la caída viene de un punto de venta que dejó de ofrecer el programa.",
      })
    }
  }

  // 2. New vs. returning mix
  if (unique >= 10) {
    const returningShare = pct(s.returningClients, unique)
    if (returningShare < 40) {
      out.push({
        key: "mix_new_heavy",
        tone: "warn",
        score: 60,
        title: "Pocos clientes vuelven",
        what: `Solo ${returningShare} % de los ${unique} clientes que te visitaron ${here} ya habían venido antes; el resto eran primerizos.`,
        why: "Un programa de fidelidad vive de la segunda y tercera visita. Muchos primerizos y pocos recurrentes significa que la gente se registra pero no regresa.",
        action: isPoints
          ? "Envía un push a los registrados hace 7 a 14 días que no han vuelto, recordándoles los puntos que ya tienen."
          : "Envía un push a los registrados hace 7 a 14 días que no han vuelto, con el sello que les falta bien visible.",
      })
    } else if (s.newVisitors === 0 || pct(s.newVisitors, unique) < 10) {
      out.push({
        key: "mix_no_new",
        tone: "warn",
        score: 55,
        title: "Casi no entran clientes nuevos",
        what: `${plural(s.newVisitors, "cliente nuevo visitó", "clientes nuevos visitaron")} ${here} (${pct(s.newVisitors, unique)} % del total).`,
        why: "La base de clientes fieles se desgasta sola; sin entradas nuevas el programa se estanca en 2 o 3 meses.",
        action:
          "Haz visible el QR de registro en caja y en las mesas, y pide a los cajeros que lo ofrezcan al cobrar.",
      })
    }
  }

  // 3. Rewards / points not being used
  if (isPoints && s.points) {
    const p = s.points
    if (data.actionable.count > 0 && p.redeemed === 0 && visits > 0) {
      out.push({
        key: "no_redemptions",
        tone: "warn",
        score: 65,
        title: "Nadie canjeó puntos",
        what: `${plural(data.actionable.count, "cliente tiene", "clientes tienen")} saldo suficiente para un premio y no hubo ningún canje ${here}.`,
        why: "El canje es el momento en que el cliente siente el beneficio; sin canjes el programa es solo un contador.",
        action:
          "Pide a los cajeros que avisen en caja cuando el saldo alcanza para el premio más barato del catálogo.",
      })
    } else if (p.earned > 0) {
      const ratio = pct(p.redeemed, p.earned)
      if (ratio >= 60) {
        out.push({
          key: "healthy_redemptions",
          tone: "good",
          score: 30,
          title: "Los puntos se están usando",
          what: `Se canjearon ${p.redeemed} puntos de ${p.earned} ganados ${here} (${ratio} %).`,
          why: "Un canje alto significa que el premio es alcanzable y deseado: la mecánica funciona.",
          action:
            "Mantén el catálogo como está; si quieres subir el ticket, agrega un premio más caro sin quitar el actual.",
        })
      }
    }
    if (p.expired > 0) {
      out.push({
        key: "points_expired",
        tone: "info",
        score: 35,
        title: "Puntos que vencieron",
        what: `${plural(p.expired, "punto venció", "puntos vencieron")} ${here} sin usarse.`,
        why: "Vencer puntos es parte de la mecánica, pero si vencen muchos sin canjear el cliente lo percibe como pérdida.",
        action: p.warningEnabled
          ? "El aviso de vencimiento está activo; revisa que el mensaje diga claramente cuánto y cuándo vence."
          : "Activa el aviso de puntos por vencer en Campañas: el cliente recibe un push el día antes.",
      })
    }
    if (p.expiringNext.points > 0 && !p.warningEnabled) {
      out.push({
        key: "expiring_no_warning",
        tone: "warn",
        score: 70,
        title: "Puntos por vencer sin aviso",
        what: `${plural(p.expiringNext.clients, "cliente tiene", "clientes tienen")} ${plural(p.expiringNext.points, "punto que vence", "puntos que vencen")} en los próximos 7 días y el aviso automático está apagado.`,
        why: "El aviso de vencimiento es el push que más visitas trae: el cliente viene a usar lo que está por perder.",
        action: "Actívalo en Campañas → Aviso de puntos por vencer. Toma un minuto.",
      })
    }
  }
  if (!isPoints && s.stamps) {
    if (s.stamps.pendingTotal > 0 && data.kpis.rewardsRedeemed.current === 0 && visits > 0) {
      out.push({
        key: "no_redemptions",
        tone: "warn",
        score: 65,
        title: "Premios completos sin cobrar",
        what: `${plural(s.stamps.pendingTotal, "cliente completó", "clientes completaron")} su tarjeta y ${here} nadie vino a cobrar el premio.`,
        why: "El premio cobrado es lo que convierte al cliente en promotor; un premio olvidado es una oportunidad perdida.",
        action:
          'Envía un push al segmento con premio pendiente: "Tu premio te espera". Está listo en Campañas.',
      })
    }
  }

  // 4. Campaign effect
  for (const c of s.campaignLift) {
    // Too few recipients or too little traffic to read anything into 48 hours.
    if (c.liftPct === null || c.sentCount < 10 || c.expected < 3) continue
    const good = c.liftPct >= 20
    out.push({
      key: `campaign:${c.name}`,
      tone: good ? "good" : "info",
      score: good ? 50 : 25,
      title: good ? `La campaña "${c.name}" trajo gente` : `La campaña "${c.name}" movió poco`,
      what: `${plural(c.visitsAfter, "visita", "visitas")} en las 48 horas siguientes al envío, frente a ${c.expected} que serían lo normal (${c.liftPct > 0 ? "+" : ""}${c.liftPct} %).`,
      why: good
        ? "Medir las 48 horas después del push es la forma más directa de saber si el mensaje mueve a la gente."
        : "Un push que no cambia las visitas suele tener un mensaje genérico o llegar a un segmento equivocado.",
      action: good
        ? "Repite el formato: mismo tipo de incentivo, mismo día y hora, al segmento que respondió."
        : "Prueba un incentivo concreto (sello extra, puntos dobles) y envíalo un día antes de tu día fuerte.",
    })
  }

  // 5. Rhythm changes: peak hour and best weekday
  const enoughForRhythm = visits >= 15
  if (
    enoughForRhythm &&
    s.peakHour.current &&
    s.peakHour.previous &&
    s.peakHour.current !== s.peakHour.previous
  ) {
    out.push({
      key: "peak_shift",
      tone: "info",
      score: 20,
      title: "Cambió tu hora pico",
      what: `${here[0].toUpperCase()}${here.slice(1)} la hora con más visitas fue las ${s.peakHour.current}; ${isWeekly ? "la semana pasada" : "el mes pasado"} fue las ${s.peakHour.previous}.`,
      why: "La hora pico es cuando más clientes nuevos se pueden registrar y cuando el cajero tiene menos tiempo para ofrecerlo.",
      action:
        "Refuerza esa franja con alguien más en caja o deja el QR de registro a la vista para que el cliente se inscriba solo.",
    })
  }
  if (
    isWeekly &&
    enoughForRhythm &&
    s.bestWeekday.current &&
    s.bestWeekday.previous &&
    s.bestWeekday.current !== s.bestWeekday.previous
  ) {
    out.push({
      key: "weekday_shift",
      tone: "info",
      score: 15,
      title: "Cambió tu día fuerte",
      what: `Esta semana el día con más visitas fue el ${s.bestWeekday.current}; la anterior fue el ${s.bestWeekday.previous}.`,
      why: "Saber qué día concentra visitas te dice cuándo programar campañas y cuándo poner el mejor equipo en caja.",
      action: "Programa el próximo push para la víspera de tu día fuerte.",
    })
  }

  // 6. Branches and cashiers
  if (data.team.showBranches) {
    const drops = data.team.branches
      .filter((b) => b.id !== null && b.previousVisits >= 5)
      .map((b) => ({ b, change: pctChange(b.visits, b.previousVisits) ?? 0 }))
      .filter((x) => x.change <= -30)
      .sort((a, b) => a.change - b.change)
    if (drops.length > 0) {
      const { b, change } = drops[0]
      out.push({
        key: "branch_drop",
        tone: "warn",
        score: 75,
        title: `${b.name} cayó ${Math.abs(change)} %`,
        what: `${plural(b.visits, "visita", "visitas")} ${here} frente a ${b.previousVisits} en ${data.compareLabel}.`,
        why: "Cuando una sola sede cae mientras las demás se mantienen, el problema casi nunca es el cliente: es que en esa caja dejaron de registrar u ofrecer el programa.",
        action:
          "Habla con el encargado de esa sede y revisa en la hoja de cajeros quién registró visitas y quién no.",
      })
    }
    const real = data.team.branches.filter((b) => b.id !== null && b.active)
    const top = real[0]
    if (top && real.length >= 2 && top.share >= 70 && visits >= 20) {
      out.push({
        key: "branch_concentration",
        tone: "info",
        score: 30,
        title: `${top.share} % de las visitas son de ${top.name}`,
        what: `Las otras ${plural(real.length - 1, "sede suma", "sedes suman")} ${100 - top.share} % del total.`,
        why: "El programa está funcionando en una sede; replicar lo que hace esa caja es el camino más corto para crecer.",
        action: `Lleva la rutina de ${top.name} a las demás: cómo ofrecen el registro y cuándo escanean el pase.`,
      })
    }
  }
  if (data.team.showCashiers) {
    const idle = data.team.cashiers.filter((c) => c.role === "Cajero" && c.visits === 0)
    if (idle.length > 0 && visits >= 5) {
      out.push({
        key: "idle_cashiers",
        tone: "warn",
        score: 68,
        title: `${plural(idle.length, "cajero sin visitas", "cajeros sin visitas")} ${here}`,
        what: `${idle.map((c) => c.name).join(", ")} no ${idle.length === 1 ? "registró" : "registraron"} ninguna visita mientras el resto del equipo sí.`,
        why: "Cada cajero que no ofrece el programa es una parte de tus clientes que nunca se entera de que existe.",
        action:
          "Una conversación de cinco minutos suele bastar: mostrarle cómo escanear y pedirle que lo ofrezca al cobrar.",
      })
    }
  }

  // 7. At-risk share
  if (s.activeClients >= 20 && data.atRisk.length > 0) {
    const share = pct(data.atRisk.length, s.activeClients)
    if (share >= 20) {
      out.push({
        key: "at_risk_share",
        tone: "warn",
        score: 58,
        title: `${share} % de tus clientes está en riesgo`,
        what: `${plural(data.atRisk.length, "cliente que venía seguido dejó", "clientes que venían seguido dejaron")} de pasar, de ${s.activeClients} activos.`,
        why: "Recuperar a un cliente que ya te conoce cuesta mucho menos que conseguir uno nuevo.",
        action:
          'Envía la campaña "te extrañamos" al segmento En riesgo con un incentivo concreto para volver.',
      })
    }
  }

  // 7b. Second-visit rate and pass installation (depth KPIs)
  const d = s.depth
  if (d.secondVisit.cohort >= 10 && d.secondVisit.pct < 40) {
    out.push({
      key: "second_visit_low",
      tone: "warn",
      score: 64,
      title: `Solo ${d.secondVisit.pct} % vuelve a la segunda visita`,
      what: `De ${plural(d.secondVisit.cohort, "cliente que empezó", "clientes que empezaron")} hace uno o dos meses, ${d.secondVisit.returned} regresaron dentro de los 30 días siguientes.`,
      why: "La segunda visita es donde más clientes se pierden; los que la dan suelen quedarse.",
      action:
        "Programa un push a los 7 días del registro con el beneficio que les falta para el primer premio.",
    })
  }
  if (d.funnel.newRegistered >= 10) {
    const passPct = pct(d.funnel.newWithPass, d.funnel.newRegistered)
    if (passPct < 60) {
      out.push({
        key: "pass_install_low",
        tone: "warn",
        score: 57,
        title: `${100 - passPct} % de los nuevos no instaló el pase`,
        what: `${d.funnel.newWithPass} de ${d.funnel.newRegistered} registrados ${here} tienen el pase en su celular.`,
        why: "Sin pase no reciben notificaciones ni ven su saldo: están registrados, pero fuera del programa.",
        action:
          'Pide al cajero que espere a que el cliente toque "Agregar a Wallet" antes de despedirlo; toma 10 segundos.',
      })
    }
  }

  // 8. Birthdays with the automation off
  if (data.birthdays.length > 0 && !data.birthdayAutomationEnabled) {
    out.push({
      key: "birthdays_off",
      tone: "info",
      score: 22,
      title: `${plural(data.birthdays.length, "cumpleaños", "cumpleaños")} sin saludo automático`,
      what: `${isWeekly ? "La semana que empieza" : "El mes que empieza"} cumplen años ${plural(data.birthdays.length, "cliente", "clientes")} y el push de cumpleaños está apagado.`,
      why: "El saludo de cumpleaños es el mensaje con mejor recepción de todos: es personal y llega en un día en que la gente sale.",
      action: "Actívalo en Campañas → Cumpleaños; se envía solo cada mañana.",
    })
  }

  // 9. Monthly: cohort retention
  if (!isWeekly && s.cohorts.length > 0) {
    const c = s.cohorts[0]
    if (c.registered >= 5) {
      const tone: InsightTone =
        c.retentionPct >= 50 ? "good" : c.retentionPct < 30 ? "warn" : "info"
      const prev = s.cohorts[1]
      const vsPrev =
        prev && prev.registered >= 5
          ? ` Los de ${prev.label} volvieron ${prev.retentionPct} %.`
          : ""
      out.push({
        key: "cohort",
        tone,
        score: tone === "warn" ? 62 : 40,
        title: `De los registrados en ${c.label}, volvió el ${c.retentionPct} %`,
        what: `${c.returned} de ${c.registered} clientes registrados en ${c.label} regresaron al menos una vez después.${vsPrev}`,
        why: "La retención del primer mes es el mejor predictor de cuánto va a valer cada cliente que registras.",
        action:
          tone === "warn"
            ? "Refuerza la segunda visita: un push a los 7 días del registro con el beneficio que les falta."
            : "Buen dato. Mantén el incentivo de segunda visita y compáralo mes a mes.",
      })
    }
  }

  // 10. Monthly: same month last year
  if (!isWeekly && data.monthly?.lastYearVisits != null && data.monthly.lastYearVisits >= 10) {
    const change = pctChange(visits, data.monthly.lastYearVisits)
    if (change !== null && Math.abs(change) >= 15) {
      out.push({
        key: "yoy",
        tone: change > 0 ? "good" : "warn",
        score: 45,
        title: `${change > 0 ? "+" : ""}${change} % frente al mismo mes del año pasado`,
        what: `${plural(visits, "visita", "visitas")} este mes contra ${data.monthly.lastYearVisits} hace un año (${deltaShort(visits, data.monthly.lastYearVisits)}).`,
        why: "Comparar con el mismo mes del año anterior descuenta la estacionalidad: es la medida más justa de crecimiento.",
        action:
          change > 0
            ? "Documenta qué cambió este año (campañas, premios, sedes) para repetirlo."
            : "Revisa si el año pasado hubo una campaña o temporada que este año no se repitió.",
      })
    }
  }

  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  const strong = out.filter((i) => i.score >= minScore)
  return typeof limit === "number" ? strong.slice(0, limit) : strong
}

/** One-paragraph version for the email bullets. */
export function insightLine(i: Insight): string {
  const mark = i.tone === "good" ? "▲ " : i.tone === "warn" ? "▼ " : ""
  return `${mark}${i.title}. ${i.what} ${i.action}`
}
