import { describe, expect, it } from "vitest"
import type { BillingDueRow } from "./billing-overview"
import { composeReminder } from "./billing-reminders"

function row(name: string, outlook: Partial<BillingDueRow["outlook"]>): BillingDueRow {
  return {
    tenantId: name,
    tenantName: name,
    tenantSlug: name,
    tenantStatus: "active",
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

  it("widens the window when the cron missed days, and ignores upcoming invoices of paused tenants", () => {
    const rows = [
      row("Uno", { daysUntilNext: 1, nextDue: "2026-10-09" }),
      row("Dos", { daysUntilNext: 2, nextDue: "2026-10-10" }),
      { ...row("Pausado", { daysUntilNext: 3, nextDue: "2026-10-11" }), tenantStatus: "paused" },
      { ...row("PausadoVencido", { status: "vencida", daysOverdue: 20 }), tenantStatus: "paused" },
    ]
    expect(composeReminder(rows, "2026-10-08", 0)?.upcoming).toBe(0)
    const caughtUp = composeReminder(rows, "2026-10-08", 2)
    expect(caughtUp?.upcoming).toBe(2)
    expect(caughtUp?.overdue).toBe(1)
    expect(caughtUp?.subject).toContain("1 sin registrar, 2 por emitir")
  })

  it("subject without overdue names the date", () => {
    const r = composeReminder(
      [row("Dfrios", { daysUntilNext: 3, nextDue: "2026-10-11" })],
      "2026-10-08",
    )
    expect(r?.subject).toMatch(/1 factura por emitir el 11 oct/)
  })
})
