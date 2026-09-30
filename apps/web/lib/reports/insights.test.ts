import { describe, expect, it } from "vitest"
import type { ReportData } from "./compute-report"
import { buildInsights, EMPTY_SIGNALS, insightLine, type ReportSignals } from "./insights"
import { delta } from "./period"

function kpi(current: number, previous: number) {
  return { current, previous, delta: delta(current, previous) }
}

const base: ReportData = {
  kind: "weekly",
  tenant: {
    id: "t1",
    slug: "cafe",
    name: "Café",
    timezone: "America/Lima",
    programType: "points",
    stampsTarget: null,
  },
  period: { start: "2026-09-21", end: "2026-09-27", key: "2026-09-21" },
  previous: { start: "2026-09-14", end: "2026-09-20", key: "2026-09-14" },
  periodLabel: "lunes 21 al domingo 27 de setiembre de 2026",
  compareLabel: "la semana anterior",
  kpis: {
    visits: kpi(40, 38),
    uniqueClients: kpi(30, 28),
    newClients: kpi(5, 4),
    rewardsRedeemed: kpi(0, 2),
  },
  daily: [],
  bestDay: null,
  worstDay: null,
  repeatClients: 5,
  campaigns: [],
  clients: [],
  topClients: [],
  atRisk: [],
  actionable: { label: "Clientes con saldo para canjear", count: 6 },
  birthdays: [],
  birthdayAutomationEnabled: true,
  team: { branches: [], cashiers: [], showBranches: false, showCashiers: false },
  signals: EMPTY_SIGNALS,
  monthly: null,
}

function withSignals(partial: Partial<ReportSignals>, extra: Partial<ReportData> = {}): ReportData {
  return { ...base, ...extra, signals: { ...EMPTY_SIGNALS, ...partial } }
}

describe("buildInsights", () => {
  it("is empty when nothing stands out", () => {
    expect(buildInsights(withSignals({ returningClients: 20, newVisitors: 10 }))).toEqual([])
  })

  it("flags a drop against the 4-week baseline, ranked above minor items", () => {
    const data = withSignals({
      baseline: { periods: 4, visits: 60, newClients: 8, redeemed: 3 },
      returningClients: 20,
      newVisitors: 10,
      peakHour: { current: "18:00", previous: "12:00" },
    })
    const out = buildInsights(data)
    expect(out[0].key).toBe("trend")
    expect(out[0].tone).toBe("warn")
    expect(out[0].title).toBe("Vas 33 % por debajo de tu ritmo")
    expect(out[0].what).toContain("40 visitas esta semana frente a un promedio de 60")
    expect(out.map((i) => i.key)).toContain("peak_shift")
    expect(out[out.length - 1].key).toBe("peak_shift")
  })

  it("warns when few visitors are returning", () => {
    const out = buildInsights(withSignals({ returningClients: 9, newVisitors: 21 }))
    const mix = out.find((i) => i.key === "mix_new_heavy")
    expect(mix?.what).toContain("Solo 30 % de los 30 clientes")
  })

  it("points: no redemptions with balance, expired and expiring without warning", () => {
    const out = buildInsights(
      withSignals({
        returningClients: 20,
        newVisitors: 10,
        points: {
          earned: 300,
          redeemed: 0,
          expired: 45,
          expiringNext: { clients: 4, points: 120 },
          warningEnabled: false,
        },
      }),
    )
    const keys = out.map((i) => i.key)
    expect(keys[0]).toBe("expiring_no_warning")
    expect(keys).toContain("no_redemptions")
    expect(keys).toContain("points_expired")
    expect(out.find((i) => i.key === "no_redemptions")?.what).toBe(
      "6 clientes tienen saldo suficiente para un premio y no hubo ningún canje esta semana.",
    )
  })

  it("stamps: completed cards nobody cashed", () => {
    const out = buildInsights(
      withSignals(
        { returningClients: 20, newVisitors: 10, stamps: { rewardsEarned: 3, pendingTotal: 5 } },
        { tenant: { ...base.tenant, programType: "stamps", stampsTarget: 8 } },
      ),
    )
    expect(out[0].key).toBe("no_redemptions")
    expect(out[0].title).toBe("Premios completos sin cobrar")
  })

  it("measures campaign lift both ways", () => {
    const out = buildInsights(
      withSignals({
        returningClients: 20,
        newVisitors: 10,
        campaignLift: [
          {
            name: "Puntos dobles",
            sentCount: 80,
            visitsAfter: 18,
            expected: 11.4,
            liftPct: 58,
            responders: [],
          },
          {
            name: "Hola",
            sentCount: 80,
            visitsAfter: 10,
            expected: 11.4,
            liftPct: -12,
            responders: [],
          },
        ],
      }),
    )
    const good = out.find((i) => i.key === "campaign:Puntos dobles")
    const meh = out.find((i) => i.key === "campaign:Hola")
    expect(good?.tone).toBe("good")
    expect(good?.what).toContain("18 visitas en las 48 horas siguientes al envío, frente a 11.4")
    expect(meh?.tone).toBe("info")
    expect(meh?.title).toBe('La campaña "Hola" movió poco')
  })

  it("branch drop and idle cashiers come from the team block", () => {
    const branch = (
      id: string,
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
    const out = buildInsights(
      withSignals(
        { returningClients: 20, newVisitors: 10 },
        {
          team: {
            showBranches: true,
            showCashiers: true,
            branches: [branch("a", "Centro", 30, 28, 75), branch("b", "Norte", 3, 12, 8)],
            cashiers: [
              {
                id: "u1",
                name: "Rosa",
                role: "Cajero",
                visits: 33,
                previousVisits: 30,
                delta: delta(33, 30),
                activeDays: 6,
                perActiveDay: 5.5,
                newClients: 2,
                lastVisitAt: null,
              },
              {
                id: "u2",
                name: "Luis",
                role: "Cajero",
                visits: 0,
                previousVisits: 10,
                delta: delta(0, 10),
                activeDays: 0,
                perActiveDay: 0,
                newClients: 0,
                lastVisitAt: null,
              },
            ],
          },
        },
      ),
    )
    expect(out[0].key).toBe("branch_drop")
    expect(out[0].title).toBe("Norte cayó 75 %")
    expect(out[1].key).toBe("idle_cashiers")
    expect(out[1].what).toContain("Luis no registró ninguna visita")
    expect(out.map((i) => i.key)).toContain("branch_concentration")
  })

  it("monthly: cohort retention and year-over-year", () => {
    const out = buildInsights(
      withSignals(
        {
          returningClients: 20,
          newVisitors: 10,
          cohorts: [
            { ym: "2026-08", label: "agosto 2026", registered: 20, returned: 5, retentionPct: 25 },
            { ym: "2026-07", label: "julio 2026", registered: 15, returned: 9, retentionPct: 60 },
          ],
        },
        {
          kind: "monthly",
          compareLabel: "el mes anterior",
          monthly: {
            weeks: [],
            lastYearVisits: 80,
            cumulative: {
              since: "2025-01-01",
              sinceLabel: "enero de 2025",
              totals: {
                visits: 0,
                clients: 0,
                activeClients: 0,
                rewardsRedeemed: 0,
                avgVisitsPerClient: 0,
              },
              months: [],
              bestMonth: null,
              topClients: [],
              segments: [],
            },
          },
        },
      ),
    )
    const cohort = out.find((i) => i.key === "cohort")
    expect(cohort?.tone).toBe("warn")
    expect(cohort?.title).toBe("De los registrados en agosto 2026, volvió el 25 %")
    expect(cohort?.what).toContain("Los de julio 2026 volvieron 60 %.")
    const yoy = out.find((i) => i.key === "yoy")
    expect(yoy?.title).toBe("-50 % frente al mismo mes del año pasado")
  })

  it("ignores noise: tiny baselines, tiny campaigns, low-traffic rhythm changes", () => {
    const quiet = withSignals(
      {
        baseline: { periods: 4, visits: 5, newClients: 0, redeemed: 0 },
        returningClients: 6,
        newVisitors: 2,
        peakHour: { current: "18:00", previous: "12:00" },
        bestWeekday: { current: "viernes", previous: "lunes" },
        campaignLift: [
          {
            name: "Test",
            sentCount: 0,
            visitsAfter: 0,
            expected: 2.1,
            liftPct: -100,
            responders: [],
          },
        ],
      },
      { kpis: { ...base.kpis, visits: kpi(11, 5), uniqueClients: kpi(8, 4) } },
    )
    expect(buildInsights(quiet)).toEqual([])
  })

  it("minScore keeps weak items out of the email but not out of the Excel", () => {
    const data = withSignals({
      returningClients: 20,
      newVisitors: 10,
      peakHour: { current: "18:00", previous: "12:00" },
    })
    expect(buildInsights(data).map((i) => i.key)).toEqual(["peak_shift"])
    expect(buildInsights(data, 4, 30)).toEqual([])
  })

  it("limits and formats lines for the email", () => {
    const data = withSignals({
      baseline: { periods: 4, visits: 20, newClients: 2, redeemed: 1 },
      returningClients: 9,
      newVisitors: 21,
      peakHour: { current: "18:00", previous: "12:00" },
    })
    const top = buildInsights(data, 2)
    expect(top).toHaveLength(2)
    expect(insightLine(top[0])).toMatch(/^▲ Vas 100 % por encima de tu ritmo\. 40 visitas/)
  })
})
