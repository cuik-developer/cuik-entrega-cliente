import { describe, expect, it } from "vitest"
import type { BillingDueRow } from "./billing-overview"
import { composeReminder } from "./billing-reminders"

function row(name: string, outlook: Partial<BillingDueRow["outlook"]>): BillingDueRow {
  return {
    tenantId: name,
    tenantName: name,
    tenantSlug: name,
    outlook: {
      status: "al_dia",
      currentDue: "2026-09-16",
      currentPeriod: "2026-09",
      nextDue: "2026-10-16",
      daysUntilNext: 8,
      daysOverdue: null,
      monthsOfService: 1,
      monthlyAmount: 350,
      currency: "PEN",
      serviceStartOn: "2026-08-16",
      ...outlook,
    },
  }
}

describe("composeReminder", () => {
  it("is silent when nothing is due in 3 days and nothing is overdue", () => {
    expect(composeReminder([row("A", { daysUntilNext: 8 })], "2026-10-08")).toBeNull()
    expect(composeReminder([row("B", { daysUntilNext: 2 })], "2026-10-08")).toBeNull()
  })

  it("lists tenants due in exactly 3 days and the overdue ones", () => {
    const r = composeReminder(
      [
        row("Dfrios", { daysUntilNext: 3, nextDue: "2026-10-11" }),
        row("Retail", { status: "vencida", daysOverdue: 9, currentPeriod: "2026-09" }),
        row("Cafe", { daysUntilNext: 10 }),
      ],
      "2026-10-08",
    )
    expect(r).not.toBeNull()
    expect(r?.upcoming).toBe(1)
    expect(r?.overdue).toBe(1)
    expect(r?.subject).toContain("1 sin registrar, 1 por emitir")
    expect(r?.paragraphs[0]).toContain("Dfrios")
    expect(r?.paragraphs[0]).toContain("11 oct")
    expect(r?.paragraphs[1]).toContain("Retail: periodo 2026-09, hace 9 días (S/ 350.00)")
  })

  it("subject without overdue names the date", () => {
    const r = composeReminder(
      [row("Dfrios", { daysUntilNext: 3, nextDue: "2026-10-11" })],
      "2026-10-08",
    )
    expect(r?.subject).toMatch(/1 factura por emitir el 11 oct/)
  })
})
