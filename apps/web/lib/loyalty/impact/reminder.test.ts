import { describe, expect, it } from "vitest"

import { monthLabel, previousMonth } from "./reminder"

describe("impact reminder helpers", () => {
  it("names the previous month and its last day", () => {
    expect(previousMonth("2026-11-03")).toEqual({ key: "2026-10", lastDay: "2026-10-31" })
    expect(previousMonth("2026-01-05")).toEqual({ key: "2025-12", lastDay: "2025-12-31" })
    expect(previousMonth("2026-03-01")).toEqual({ key: "2026-02", lastDay: "2026-02-28" })
  })

  it("labels a month in Spanish", () => {
    expect(monthLabel("2026-10")).toBe("octubre 2026")
    expect(monthLabel("2026-01")).toBe("enero 2026")
  })
})
