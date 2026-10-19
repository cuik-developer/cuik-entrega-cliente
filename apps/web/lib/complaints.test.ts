import { describe, expect, it } from "vitest"
import { deadlineBadge, emailStatusOf, longDate } from "./complaints"

const ok = { status: "fulfilled" as const, value: { id: "x" } }
const refused = { status: "fulfilled" as const, value: { error: "nope" } }
const thrown = { status: "rejected" as const, reason: new Error("boom") }

describe("emailStatusOf", () => {
  it("sent / partial / failed", () => {
    expect(emailStatusOf([ok, ok])).toBe("sent")
    expect(emailStatusOf([ok, refused])).toBe("partial")
    expect(emailStatusOf([thrown, ok])).toBe("partial")
    expect(emailStatusOf([refused, thrown])).toBe("failed")
  })
})

describe("deadlineBadge", () => {
  const due = "2026-11-09" // Monday
  it("answered and closed ones ignore the deadline", () => {
    expect(deadlineBadge({ status: "answered", dueOn: due }, "2026-12-01").label).toBe("Respondido")
    expect(deadlineBadge({ status: "closed", dueOn: due }, "2026-12-01").label).toBe("Cerrado")
  })
  it("overdue after the due date", () => {
    expect(deadlineBadge({ status: "pending", dueOn: due }, "2026-11-10")).toEqual({
      label: "Vencido",
      tone: "bad",
    })
  })
  it("amber on the due day and up to 3 business days before", () => {
    expect(deadlineBadge({ status: "pending", dueOn: due }, due).tone).toBe("warn")
    // Wed 4 Nov → Thu, Fri, Mon = 3 business days
    expect(deadlineBadge({ status: "pending", dueOn: due }, "2026-11-04")).toEqual({
      label: "3 días hábiles",
      tone: "warn",
    })
    expect(deadlineBadge({ status: "pending", dueOn: due }, "2026-11-03").tone).toBe("mute")
  })
})

describe("longDate", () => {
  it("formats in Spanish without shifting the day", () => {
    expect(longDate("2026-11-09")).toBe("9 de noviembre de 2026")
  })
})
