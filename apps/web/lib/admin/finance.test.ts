import { describe, expect, it } from "vitest"
import {
  breakEvenMerchants,
  buildLedger,
  fxFor,
  investmentRecovery,
  loanBalanceAt,
  loanSchedule,
  monthRange,
  recurringChargeMonths,
  sumLedger,
  withCumulative,
} from "./finance"

const RATES = { "2026-09": 3.5, "2026-11": 3.8 }

describe("fx", () => {
  it("uses the month's rate, else the latest earlier one, else the default (flagged)", () => {
    expect(fxFor("2026-09", RATES)).toEqual({ rate: 3.5, estimated: false })
    expect(fxFor("2026-10", RATES)).toEqual({ rate: 3.5, estimated: false })
    expect(fxFor("2026-12", RATES)).toEqual({ rate: 3.8, estimated: false })
    expect(fxFor("2026-01", RATES)).toEqual({ rate: 3.75, estimated: true })
  })
})

describe("recurring and loans", () => {
  it("charges every N months inside the window, honouring from/to and active", () => {
    const item = {
      type: "cost" as const,
      category: "Infraestructura",
      name: "Dominio",
      amount: 120,
      currency: "USD" as const,
      everyMonths: 12,
      fromMonth: "2026-03",
      toMonth: null,
      recognition: "spread" as const,
      active: true,
    }
    expect(recurringChargeMonths(item, "2026-01", "2028-12")).toEqual([
      "2026-03",
      "2027-03",
      "2028-03",
    ])
    expect(recurringChargeMonths({ ...item, toMonth: "2027-01" }, "2026-01", "2028-12")).toEqual([
      "2026-03",
    ])
    expect(recurringChargeMonths({ ...item, active: false }, "2026-01", "2028-12")).toEqual([])
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"])
  })

  it("loan schedule and balance", () => {
    const loan = {
      name: "Préstamo",
      principal: 2616,
      currency: "USD" as const,
      installment: 218,
      installments: 12,
      firstMonth: "2026-01",
    }
    const s = loanSchedule(loan)
    expect(s).toHaveLength(12)
    expect(s[0]).toEqual({ month: "2026-01", amount: 218, balanceAfter: 2398 })
    expect(s[11].month).toBe("2026-12")
    expect(s[11].balanceAfter).toBe(0)
    expect(loanBalanceAt(loan, "2025-12")).toBe(2616)
    expect(loanBalanceAt(loan, "2026-06")).toBe(1308)
    expect(loanBalanceAt(loan, "2027-05")).toBe(0)
  })
})

describe("ledger", () => {
  // Cuik today: Mascota Veloz S/ 250 monthly, loan US$ 218, server US$ 12, rate 3.5.
  const base = {
    rates: { "2026-01": 3.5 },
    recurring: [
      {
        type: "cost" as const,
        category: "Infraestructura",
        name: "Servidor",
        amount: 12,
        currency: "USD" as const,
        everyMonths: 1,
        fromMonth: "2026-01",
        toMonth: null,
        recognition: "spread" as const,
        active: true,
      },
    ],
    entries: [],
    loans: [
      {
        name: "Préstamo",
        principal: 5232,
        currency: "USD" as const,
        installment: 218,
        installments: 24,
        firstMonth: "2026-01",
      },
    ],
    invoices: [
      {
        period: "2026-09",
        months: 1,
        amount: 250,
        currency: "PEN" as const,
        recognition: "spread" as const,
        status: "paid" as const,
        paidOn: "2026-10-01",
        issuedOn: "2026-10-01",
      },
    ],
  }

  it("a month of today's Cuik: S/ 250 in, US$ 230 out → the partner covers S/ 555", () => {
    const rows = buildLedger({ ...base, from: "2026-10", to: "2026-10" })
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.incomeCash).toBe(250) // paid 1 Oct
    expect(r.incomeAccrual).toBe(0) // it pays for September
    expect(r.costCash).toBe(42) // 12 × 3.5
    expect(r.loanPayments).toBe(763) // 218 × 3.5
    expect(r.netCash).toBe(-555)
    expect(r.autoContribution).toBe(555) // the partner covers the gap, no entry needed
    expect(r.fxEstimated).toBe(false)
  })

  it("the automatic cover counts as investment; a registered contribution replaces it", () => {
    const month = (netIncome: number, contribution = 0) => ({
      ...base,
      rates: { "2026-01": 1 },
      recurring: [],
      loans: [],
      invoices: [],
      entries: [
        {
          type: (netIncome >= 0 ? "income" : "cost") as "income" | "cost",
          category: "x",
          name: "x",
          amount: Math.abs(netIncome),
          currency: "PEN" as const,
          month: "2026-10",
          months: 1,
          recognition: "cash" as const,
        },
        ...(contribution > 0
          ? [
              {
                type: "contribution" as const,
                category: "Socio",
                name: "Aporte",
                amount: contribution,
                currency: "PEN" as const,
                month: "2026-10",
                months: 1,
                recognition: "cash" as const,
              },
            ]
          : []),
      ],
      from: "2026-10",
      to: "2026-10",
    })
    expect(buildLedger(month(-800))[0].autoContribution).toBe(800)
    expect(buildLedger(month(-800, 800))[0].autoContribution).toBe(0)
    expect(buildLedger(month(-800, 300))[0].autoContribution).toBe(500)
    expect(buildLedger(month(200))[0].autoContribution).toBe(0)
    const rec = investmentRecovery(buildLedger(month(-800)))
    expect(rec.invested).toBe(800)
    expect(rec.cashOnHand).toBe(0)
    expect(rec.recoveredIn).toBeNull()
  })

  it("an annual invoice: all cash in the month paid, a twelfth per month in accrual", () => {
    const rows = buildLedger({
      ...base,
      recurring: [],
      loans: [],
      invoices: [
        {
          period: "2026-10",
          months: 12,
          amount: 948,
          currency: "PEN" as const,
          recognition: "spread" as const,
          status: "paid" as const,
          paidOn: "2026-10-15",
          issuedOn: "2026-10-15",
        },
      ],
      from: "2026-10",
      to: "2027-09",
    })
    expect(rows[0].incomeCash).toBe(948)
    expect(rows[0].incomeAccrual).toBe(79)
    expect(rows[5].incomeCash).toBe(0)
    expect(rows[5].incomeAccrual).toBe(79)
    expect(sumLedger(rows).incomeAccrual).toBe(948)
  })

  it("a quarterly income marked 'cash' counts whole in its month in both views", () => {
    const rows = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      invoices: [],
      entries: [
        {
          type: "income" as const,
          category: "Consultoría",
          name: "Taller",
          amount: 900,
          currency: "PEN" as const,
          month: "2026-11",
          months: 3,
          recognition: "cash" as const,
        },
        {
          type: "cost" as const,
          category: "Marketing",
          name: "Anuncios",
          amount: 100,
          currency: "USD" as const,
          month: "2026-11",
          months: 1,
          recognition: "spread" as const,
        },
      ],
      from: "2026-11",
      to: "2027-01",
    })
    expect(rows[0].incomeCash).toBe(900)
    expect(rows[0].incomeAccrual).toBe(900)
    expect(rows[1].incomeAccrual).toBe(0)
    expect(rows[0].costCash).toBe(375) // default rate, flagged
    expect(rows[0].fxEstimated).toBe(true)
  })

  it("a prepaid quarterly cost paid before the window still spreads into it", () => {
    const rows = buildLedger({
      rates: { "2026-01": 1 },
      recurring: [
        {
          type: "cost" as const,
          category: "Licencias y software",
          name: "Herramienta",
          amount: 300,
          currency: "PEN" as const,
          everyMonths: 3,
          fromMonth: "2026-10",
          toMonth: null,
          recognition: "spread" as const,
          active: true,
        },
      ],
      entries: [],
      loans: [],
      invoices: [],
      from: "2026-11",
      to: "2026-12",
    })
    expect(rows[0].costCash).toBe(0)
    expect(rows[0].costAccrual).toBe(100)
    expect(rows[1].costAccrual).toBe(100)
  })

  it("contributions and returns, break-even and recovery", () => {
    const rows = buildLedger({
      rates: { "2026-01": 3.5 },
      recurring: [],
      loans: [],
      invoices: [],
      entries: [
        {
          type: "contribution" as const,
          category: "Socio",
          name: "Aporte",
          amount: 1000,
          currency: "PEN" as const,
          month: "2026-10",
          months: 1,
          recognition: "cash" as const,
        },
        {
          type: "return" as const,
          category: "Socio",
          name: "Devolución",
          amount: 200,
          currency: "PEN" as const,
          month: "2026-12",
          months: 1,
          recognition: "cash" as const,
        },
        {
          type: "income" as const,
          category: "Servicios",
          name: "Venta",
          amount: 1500,
          currency: "PEN" as const,
          month: "2026-12",
          months: 1,
          recognition: "cash" as const,
        },
      ],
      from: "2026-10",
      to: "2026-12",
    })
    expect(rows[0].contributions).toBe(1000)
    expect(rows[2].returns).toBe(200)
    const rec = investmentRecovery(rows, 5000)
    expect(rec.invested).toBe(6000)
    expect(rec.returned).toBe(200)
    expect(rec.outstanding).toBe(5800)
    expect(rec.recoveredIn).toBeNull()
    // Opening investment of 100 is recovered once the business generated 100 on its own.
    const small = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      invoices: [],
      entries: [
        {
          type: "income" as const,
          category: "Servicios",
          name: "Venta",
          amount: 60,
          currency: "PEN" as const,
          month: "2026-10",
          months: 1,
          recognition: "cash" as const,
        },
        {
          type: "income" as const,
          category: "Servicios",
          name: "Venta",
          amount: 60,
          currency: "PEN" as const,
          month: "2026-11",
          months: 1,
          recognition: "cash" as const,
        },
      ],
      from: "2026-10",
      to: "2026-11",
    })
    expect(investmentRecovery(small, 100).recoveredIn).toBe("2026-11")
    expect(investmentRecovery(small, 100).outstanding).toBe(100)
    expect(breakEvenMerchants(862, 250)).toBe(4)
    expect(breakEvenMerchants(862, 0)).toBeNull()
  })

  it("projects merchant income from the first uncovered month: arrears pays the month after", () => {
    // Mascota Veloz: S/ 250 monthly in arrears, September paid (covered through Sep).
    const rows = buildLedger({
      ...base,
      expected: [
        {
          amount: 250,
          currency: "PEN" as const,
          intervalMonths: 1,
          billingMode: "arrears" as const,
          startMonth: "2026-02",
          firstUncovered: "2026-10",
        },
      ],
      todayMonth: "2026-10",
      from: "2026-10",
      to: "2026-12",
    })
    // October: the Sep invoice was paid on 1 Oct (cash) and October itself accrues 250 to come.
    expect(rows[0]).toMatchObject({
      incomeCash: 250,
      projectedCash: 0,
      projectedAccrual: 250,
      netCash: -555,
      netAccrual: -555,
    })
    // November: October's invoice is paid in November (cash), November accrues.
    expect(rows[1]).toMatchObject({ projectedCash: 250, projectedAccrual: 250, netCash: -555 })
    expect(rows[2]).toMatchObject({ projectedCash: 250, projectedAccrual: 250 })
  })

  it("projects a quarterly merchant in advance: cash at the period start, a third per month", () => {
    const rows = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      invoices: [],
      entries: [],
      expected: [
        {
          amount: 237,
          currency: "PEN" as const,
          intervalMonths: 3,
          billingMode: "advance" as const,
          startMonth: "2026-11",
          firstUncovered: "2026-11",
        },
      ],
      todayMonth: "2026-10",
      from: "2026-10",
      to: "2027-02",
    })
    expect(rows.map((r) => r.projectedCash)).toEqual([0, 237, 0, 0, 237])
    expect(rows.map((r) => r.projectedAccrual)).toEqual([0, 79, 79, 79, 79])
    expect(rows[0].fxEstimated).toBe(false) // PEN never flags the rate
  })

  it("never projects months before today, even when old periods were never invoiced", () => {
    const rows = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      invoices: [],
      entries: [],
      expected: [
        {
          amount: 100,
          currency: "PEN" as const,
          intervalMonths: 1,
          billingMode: "advance" as const,
          startMonth: "2026-01",
          firstUncovered: "2026-06",
        },
      ],
      todayMonth: "2026-10",
      from: "2026-05",
      to: "2026-11",
    })
    expect(rows.slice(0, 5).every((r) => r.projectedCash === 0 && r.projectedAccrual === 0)).toBe(
      true,
    )
    expect(rows[5]).toMatchObject({ month: "2026-10", projectedCash: 100, projectedAccrual: 100 })
    const cum = withCumulative(rows)
    expect(cum[6].cumulativeCash).toBe(200)
    expect(sumLedger(rows).projectedCash).toBe(200)
  })

  it("an arrears period that ends before today but is paid from today on counts whole", () => {
    // September not invoiced yet (arrears, invoice due in October): cash in Oct, accrual in Sep.
    const rows = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      invoices: [],
      entries: [],
      expected: [
        {
          amount: 250,
          currency: "PEN" as const,
          intervalMonths: 1,
          billingMode: "arrears" as const,
          startMonth: "2026-02",
          firstUncovered: "2026-09",
        },
      ],
      todayMonth: "2026-10",
      from: "2026-08",
      to: "2026-10",
    })
    expect(rows.map((r) => r.projectedAccrual)).toEqual([0, 250, 250])
    expect(rows.map((r) => r.projectedCash)).toEqual([0, 0, 250])
  })

  it("a pending invoice is expected cash now, and spreads in accrual as usual", () => {
    const rows = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      entries: [],
      invoices: [
        {
          period: "2026-09",
          months: 1,
          amount: 250,
          currency: "PEN" as const,
          recognition: "spread" as const,
          status: "pending" as const,
          paidOn: null,
          issuedOn: "2026-10-01",
        },
      ],
      todayMonth: "2026-10",
      from: "2026-09",
      to: "2026-10",
    })
    expect(rows[0]).toMatchObject({ incomeAccrual: 250, incomeCash: 0, projectedCash: 0 })
    expect(rows[1]).toMatchObject({ incomeCash: 0, projectedCash: 250, netCash: 250 })
  })

  it("recovery: the business can pay the partner back once its own cumulative cash is ≥ 0", () => {
    const entry = (type: "contribution" | "income" | "cost", amount: number, month: string) => ({
      type,
      category: "x",
      name: "x",
      amount,
      currency: "PEN" as const,
      month,
      months: 1,
      recognition: "cash" as const,
    })
    const rows = buildLedger({
      rates: {},
      recurring: [],
      loans: [],
      invoices: [],
      entries: [
        entry("contribution", 600, "2026-10"),
        entry("cost", 600, "2026-10"),
        entry("income", 300, "2026-11"),
        entry("income", 400, "2026-12"),
      ],
      from: "2026-10",
      to: "2026-12",
    })
    const rec = investmentRecovery(rows)
    expect(rec.invested).toBe(600)
    expect(rec.outstanding).toBe(600)
    expect(rec.recoveredIn).toBe("2026-12") // Σ net: −600, −300, +100
    expect(rec.cashOnHand).toBe(700) // 600 contributed + 100 generated
  })
})
