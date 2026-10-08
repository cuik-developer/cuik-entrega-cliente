import { describe, expect, it } from "vitest"
import {
  billingOutlook,
  daysBetween,
  effectiveBillingDay,
  firstDue,
  formatYmd,
  monthsOfService,
} from "./billing"

// Service started 16 Aug 2026 → invoices on the 16th of every month.
const RULE = { serviceStartOn: "2026-08-16", billingDay: null }

describe("effectiveBillingDay / firstDue", () => {
  it("uses the service start day, capped at 28, unless overridden", () => {
    expect(effectiveBillingDay(RULE)).toBe(16)
    expect(effectiveBillingDay({ serviceStartOn: "2026-01-31", billingDay: null })).toBe(28)
    expect(effectiveBillingDay({ serviceStartOn: "2026-01-31", billingDay: 5 })).toBe(5)
    expect(effectiveBillingDay({ serviceStartOn: null, billingDay: null })).toBeNull()
    expect(firstDue(RULE)).toBe("2026-08-16")
  })
})

describe("monthsOfService", () => {
  it("counts full months from the service start", () => {
    expect(monthsOfService("2026-08-16", "2026-08-20")).toBe(0)
    expect(monthsOfService("2026-08-16", "2026-09-15")).toBe(0)
    expect(monthsOfService("2026-08-16", "2026-09-16")).toBe(1)
    expect(monthsOfService("2026-08-16", "2026-10-08")).toBe(1)
    expect(monthsOfService("2026-08-16", "2027-02-16")).toBe(6)
    expect(monthsOfService("2026-08-16", "2026-08-01")).toBe(0)
  })
})

describe("billingOutlook", () => {
  it("not configured", () => {
    expect(billingOutlook({ serviceStartOn: null, billingDay: null }, []).status).toBe(
      "sin_configurar",
    )
  })

  it("service starts in the future: first invoice is the start day", () => {
    const o = billingOutlook({ serviceStartOn: "2026-11-16", billingDay: null }, [], "2026-10-08")
    expect(o.status).toBe("sin_iniciar")
    expect(o.nextDue).toBe("2026-11-16")
    expect(o.daysUntilNext).toBe(39)
    expect(o.monthsOfService).toBe(0)
  })

  it("al día when the current period is invoiced; next is next month's day", () => {
    const o = billingOutlook(RULE, ["2026-08", "2026-09"], "2026-10-08")
    expect(o.currentDue).toBe("2026-09-16")
    expect(o.currentPeriod).toBe("2026-09")
    expect(o.status).toBe("al_dia")
    expect(o.nextDue).toBe("2026-10-16")
    expect(o.daysUntilNext).toBe(8)
    expect(o.monthsOfService).toBe(1)
  })

  it("pendiente within 7 days of the due date, vencida after", () => {
    expect(billingOutlook(RULE, ["2026-08", "2026-09"], "2026-10-16").status).toBe("pendiente")
    expect(billingOutlook(RULE, ["2026-08", "2026-09"], "2026-10-23").status).toBe("pendiente")
    const late = billingOutlook(RULE, ["2026-08", "2026-09"], "2026-10-24")
    expect(late.status).toBe("vencida")
    expect(late.daysOverdue).toBe(8)
    expect(late.currentPeriod).toBe("2026-10")
  })

  it("the start day itself is the first due date", () => {
    const o = billingOutlook(RULE, [], "2026-08-16")
    expect(o.currentDue).toBe("2026-08-16")
    expect(o.status).toBe("pendiente")
    expect(o.nextDue).toBe("2026-08-16")
    expect(o.daysUntilNext).toBe(0)
  })

  it("due today and already invoiced: next due is next month", () => {
    const o = billingOutlook(RULE, ["2026-08", "2026-09", "2026-10"], "2026-10-16")
    expect(o.status).toBe("al_dia")
    expect(o.nextDue).toBe("2026-11-16")
  })

  it("override of the billing day", () => {
    const o = billingOutlook(
      { serviceStartOn: "2026-08-16", billingDay: 1 },
      ["2026-08", "2026-09"],
      "2026-10-08",
    )
    expect(o.currentDue).toBe("2026-10-01")
    expect(o.status).toBe("pendiente")
    expect(o.nextDue).toBe("2026-11-01")
  })

  it("December rolls into January", () => {
    const o = billingOutlook(RULE, ["2026-12"], "2026-12-20")
    expect(o.nextDue).toBe("2027-01-16")
  })
})

describe("helpers", () => {
  it("daysBetween and formatYmd", () => {
    expect(daysBetween("2026-10-08", "2026-10-16")).toBe(8)
    expect(formatYmd("2026-11-16")).toMatch(/16.*nov.*2026/)
  })
})
