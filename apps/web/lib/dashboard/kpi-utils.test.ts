import { describe, expect, it } from "vitest"
import { pctDelta, weekRangeLabel } from "./kpi-utils"

describe("pctDelta", () => {
  it("rounds the percentage change", () => {
    expect(pctDelta(48, 41)).toBe(17)
    expect(pctDelta(30, 40)).toBe(-25)
    expect(pctDelta(10, 10)).toBe(0)
  })

  it("has no answer without a base", () => {
    expect(pctDelta(5, 0)).toBeNull()
    expect(pctDelta(0, 0)).toBeNull()
  })
})

describe("weekRangeLabel", () => {
  it("spans Monday to today", () => {
    expect(weekRangeLabel("2026-09-08")).toBe("lun–mar") // Tuesday
    expect(weekRangeLabel("2026-09-13")).toBe("lun–dom") // Sunday closes the week
  })

  it("is just 'lun' on Mondays", () => {
    expect(weekRangeLabel("2026-09-07")).toBe("lun")
  })
})
