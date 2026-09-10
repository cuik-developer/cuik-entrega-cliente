import { describe, expect, it } from "vitest"
import { pctDelta } from "./kpi-utils"

describe("pctDelta", () => {
  it("rounds the percentage change", () => {
    expect(pctDelta(2, 3)).toBe(-33)
    expect(pctDelta(48, 41)).toBe(17)
    expect(pctDelta(10, 10)).toBe(0)
  })

  it("reads as 0% without a base", () => {
    expect(pctDelta(5, 0)).toBe(0)
    expect(pctDelta(0, 0)).toBe(0)
  })
})
