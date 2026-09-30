import { describe, expect, it } from "vitest"
import { composeReportEmail, reportPreview, reportSubject, teamItems } from "./compose-email"
import type { ReportData } from "./compute-report"
import { delta } from "./period"

function kpi(current: number, previous: number) {
  return { current, previous, delta: delta(current, previous) }
}

const base: ReportData = {
  kind: "weekly",
  tenant: {
    id: "t1",
    slug: "mascota-veloz",
    name: "Mascota Veloz",
    timezone: "America/Lima",
    programType: "stamps",
    stampsTarget: 6,
  },
  period: { start: "2026-09-07", end: "2026-09-13", key: "2026-09-07" },
  previous: { start: "2026-08-31", end: "2026-09-06", key: "2026-08-31" },
  periodLabel: "lunes 7 al domingo 13 de setiembre de 2026",
  compareLabel: "la semana anterior",
  kpis: {
    visits: kpi(42, 37),
    uniqueClients: kpi(31, 29),
    newClients: kpi(9, 6),
    rewardsRedeemed: kpi(4, 5),
  },
  daily: [],
  bestDay: {
    date: "2026-09-12",
    weekday: "sábado",
    visits: 11,
    uniqueClients: 10,
    newClients: 3,
    rewardsRedeemed: 1,
    peakHour: "11:00",
  },
  worstDay: {
    date: "2026-09-08",
    weekday: "martes",
    visits: 2,
    uniqueClients: 2,
    newClients: 0,
    rewardsRedeemed: 0,
    peakHour: "11:00",
  },
  repeatClients: 6,
  campaigns: [
    { name: "Promo de vacunas", sentAt: new Date("2026-09-10T15:00:00Z"), sentCount: 58 },
  ],
  clients: [],
  topClients: [
    {
      id: "c1",
      name: "Diego Solari",
      periodVisits: 4,
      totalVisits: 17,
      lastVisitAt: null,
      progress: "3 de 6",
      segment: "Frecuente",
      pendingReward: false,
      amount: null,
    },
    {
      id: "c2",
      name: "Ana Torres",
      periodVisits: 3,
      totalVisits: 24,
      lastVisitAt: null,
      progress: "6 de 6",
      segment: "Frecuente",
      pendingReward: true,
      amount: null,
    },
  ],
  atRisk: Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`,
    name: `Cliente ${i}`,
    totalVisits: 10,
    lastVisitAt: null,
    daysSince: 40,
    progress: "2 de 6",
  })),
  actionable: { label: "Premios pendientes de canje", count: 3 },
  birthdays: [
    {
      name: "Diego Solari",
      date: "2026-09-16",
      weekday: "miércoles",
      autoPush: "Programado 10:00",
    },
    { name: "Carla Mendoza", date: "2026-09-19", weekday: "sábado", autoPush: "Programado 10:00" },
  ],
  birthdayAutomationEnabled: true,
  team: { branches: [], cashiers: [], showBranches: false, showCashiers: false },
  monthly: null,
}

const urls = {
  panel: "https://cuik.org/panel",
  campaigns: "https://cuik.org/panel/campanas",
  clientsAtRisk: "https://cuik.org/panel/clientes?segment=en_riesgo",
}

describe("subject and preview", () => {
  it("weekly subject leads with visits and the delta", () => {
    expect(reportSubject(base)).toBe("Mascota Veloz: 42 visitas esta semana (+14 %)")
  })
  it("monthly subject names the month", () => {
    const m: ReportData = { ...base, kind: "monthly", periodLabel: "setiembre de 2026" }
    expect(reportSubject(m)).toBe("Mascota Veloz en setiembre: 42 visitas (+14 %)")
  })
  it("preview lists new clients, rewards and birthdays", () => {
    expect(reportPreview(base)).toBe(
      "9 clientes nuevos, 4 premios canjeados y 2 cumpleaños esta semana",
    )
  })
})

describe("composeReportEmail", () => {
  it("builds the three KPI tiles with arrows", () => {
    const e = composeReportEmail(base, urls)
    expect(e.kpis.map((k) => k.label)).toEqual(["Visitas", "Clientes nuevos", "Premios canjeados"])
    expect(e.kpis[0]).toMatchObject({ value: 42, deltaText: "▲ +14 % · antes 37", direction: "up" })
    expect(e.kpis[2].direction).toBe("down")
  })

  it("writes the happened / loyal / act sections in plain Spanish", () => {
    const e = composeReportEmail(base, urls)
    const [happened, loyal, act] = e.sections
    expect(happened.items[0]).toBe(
      "El día más fuerte fue el sábado 12 con 11 visitas. El más flojo, el martes 8 con 2.",
    )
    expect(happened.items[1]).toBe(
      "31 clientes distintos te visitaron; 6 vinieron dos veces o más.",
    )
    expect(happened.items[2]).toBe('Enviaste 1 campaña push ("Promo de vacunas") a 58 clientes.')
    expect(loyal.items).toEqual([
      "Diego Solari · 4 visitas · lleva 3 de 6",
      "Ana Torres · 3 visitas · premio disponible sin canjear",
    ])
    expect(act.items[0]).toContain("6 clientes en riesgo")
    expect(act.items[0]).toContain("Recomendación: envíales una campaña push")
    expect(act.items[1]).toBe(
      "3 premios pendientes de canje: clientes que completaron la tarjeta y no han venido a cobrar.",
    )
    expect(act.items[2]).toContain(
      "2 cumpleaños la semana que empieza: Diego Solari (mié 16), Carla Mendoza (sáb 19).",
    )
    expect(act.link).toEqual({
      label: "Crear campaña para clientes en riesgo",
      href: urls.clientsAtRisk,
    })
    expect(e.attachmentName).toBe("mascota-veloz-semana-2026-09-07.xlsx")
    expect(e.heading).toBe("Tu semana en Mascota Veloz")
  })

  it("omits the at-risk link when nobody is at risk and says so when there were no visits", () => {
    const quiet: ReportData = {
      ...base,
      atRisk: [],
      bestDay: null,
      worstDay: null,
      kpis: { ...base.kpis, uniqueClients: kpi(0, 3), visits: kpi(0, 3) },
      campaigns: [],
    }
    const e = composeReportEmail(quiet, urls)
    expect(e.sections[0].items[0]).toBe("No hubo visitas esta semana.")
    expect(e.sections[2].link).toBeUndefined()
  })

  it("adds the all-time section on monthly reports", () => {
    const m: ReportData = {
      ...base,
      kind: "monthly",
      periodLabel: "setiembre de 2026",
      compareLabel: "el mes anterior",
      monthly: {
        weeks: [
          {
            label: "Semana 1 (1 al 6)",
            start: "2026-09-01",
            end: "2026-09-06",
            visits: 30,
            newClients: 2,
            rewardsRedeemed: 1,
          },
          {
            label: "Semana 2 (7 al 13)",
            start: "2026-09-07",
            end: "2026-09-13",
            visits: 42,
            newClients: 9,
            rewardsRedeemed: 4,
          },
        ],
        lastYearVisits: 120,
        cumulative: {
          since: "2026-04-10",
          sinceLabel: "abril de 2026",
          totals: {
            visits: 1240,
            clients: 310,
            activeClients: 250,
            rewardsRedeemed: 96,
            avgVisitsPerClient: 5,
          },
          months: [],
          bestMonth: {
            ym: "2026-08",
            label: "agosto 2026",
            visits: 180,
            newClients: 20,
            rewardsRedeemed: 12,
          },
          topClients: [
            { name: "Ana Torres", totalVisits: 24, lastVisitAt: null, progress: "6 de 6" },
          ],
          segments: [],
        },
      },
    }
    const e = composeReportEmail(m, urls)
    expect(e.heading).toBe("Setiembre en Mascota Veloz")
    expect(e.sections[0].items).toContain(
      "Tu mejor semana fue la semana 2 (7 al 13) con 42 visitas.",
    )
    expect(e.sections[0].items).toContain(
      "El mismo mes del año pasado tuviste 120 visitas (-65 %).",
    )
    const last = e.sections[e.sections.length - 1]
    expect(last.title).toBe("Desde que empezaste")
    expect(last.items[0]).toBe(
      "Desde abril de 2026: 1240 visitas, 310 clientes registrados y 96 premios canjeados.",
    )
    expect(last.items[2]).toBe("Tu mejor mes fue agosto 2026 con 180 visitas.")
    expect(e.attachmentName).toBe("mascota-veloz-mes-2026-09-07.xlsx")
  })
})

describe("teamItems", () => {
  const branch = (
    id: string | null,
    name: string,
    visits: number,
    previousVisits: number,
    share: number,
  ) => ({
    id,
    name,
    active: true,
    visits,
    previousVisits,
    delta: delta(visits, previousVisits),
    uniqueClients: visits,
    newClients: 0,
    share,
  })
  const cashier = (
    id: string,
    name: string,
    visits: number,
    activeDays: number,
    role: "Cajero" | "Admin" = "Cajero",
  ) => ({
    id,
    name,
    role,
    visits,
    previousVisits: 5,
    delta: delta(visits, 5),
    activeDays,
    perActiveDay: activeDays ? Math.round((visits / activeDays) * 10) / 10 : 0,
    newClients: 0,
    lastVisitAt: null,
  })

  it("stays silent for a single-branch, single-cashier business", () => {
    expect(teamItems(base, true)).toEqual([])
    expect(composeReportEmail(base, urls).sections.map((s) => s.title)).not.toContain(
      "Tus sucursales y cajeros",
    )
  })

  it("names the strongest and weakest branch, the unassigned visits and the idle cashiers", () => {
    const data: ReportData = {
      ...base,
      team: {
        showBranches: true,
        showCashiers: true,
        branches: [
          branch("a", "Miraflores", 30, 25, 71),
          branch("b", "San Isidro", 0, 4, 0),
          branch(null, "Sin sucursal", 12, 0, 29),
        ],
        cashiers: [
          cashier("u1", "Rosa", 20, 5),
          cashier("u2", "Luis", 0, 0),
          cashier("u3", "Pedro", 0, 0),
          cashier("u4", "Ana (admin)", 3, 1, "Admin"),
        ],
      },
    }
    const items = teamItems(data, true)
    expect(items[0]).toContain("Sede más fuerte: Miraflores con 30 visitas (71 % del total, +20 %")
    expect(items[0]).toContain("San Isidro no registró ninguna visita esta semana")
    expect(items[1]).toContain("12 visitas quedaron sin sucursal asignada")
    expect(items[2]).toContain("Cajero más activo: Rosa con 20 visitas en 5 días (4 por día)")
    expect(items[3]).toContain("2 cajeros no registraron ninguna visita esta semana: Luis, Pedro")
    const e = composeReportEmail(data, urls)
    expect(e.sections[1].title).toBe("Tus sucursales y cajeros")
  })
})
