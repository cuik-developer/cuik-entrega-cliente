import { describe, expect, it } from "vitest"
import { buildPassChurn, churnRate, formatChurnRate } from "./pass-churn"

describe("churnRate", () => {
  it("is null when there is nothing installed or removed", () => {
    expect(churnRate(0, 0)).toBeNull()
  })

  it("is removed / (installed + removed) with one decimal", () => {
    expect(churnRate(1, 3)).toBe(25)
    expect(churnRate(1, 2)).toBe(33.3)
    expect(churnRate(2, 1)).toBe(66.7)
  })

  it("is 0 with installs and no removals, 100 with only removals", () => {
    expect(churnRate(0, 10)).toBe(0)
    expect(churnRate(4, 0)).toBe(100)
  })

  it("treats negative inputs as 0", () => {
    expect(churnRate(-1, 0)).toBeNull()
    expect(churnRate(1, -5)).toBe(100)
  })
})

describe("buildPassChurn", () => {
  it("computes the total and the last-30-days rates against installed now", () => {
    expect(buildPassChurn(8, 2, 1)).toEqual({
      installed: 8,
      removed: 2,
      removed30d: 1,
      rate: 20,
      rate30d: 11.1,
    })
  })

  it("keeps null rates for an empty tenant", () => {
    const c = buildPassChurn(0, 0, 0)
    expect(c.rate).toBeNull()
    expect(c.rate30d).toBeNull()
  })
})

describe("formatChurnRate", () => {
  it("formats with one decimal or a dash", () => {
    expect(formatChurnRate(null)).toBe("—")
    expect(formatChurnRate(25)).toBe("25.0%")
    expect(formatChurnRate(33.3)).toBe("33.3%")
  })
})
