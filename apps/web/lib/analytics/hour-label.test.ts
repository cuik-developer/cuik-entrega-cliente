import { describe, expect, it } from "vitest"
import { hourLabel } from "./hour-label"

describe("hourLabel", () => {
  it("renders the heatmap column labels: 9am · 11am · 1pm · 3pm · 5pm · 7pm", () => {
    expect([9, 11, 13, 15, 17, 19].map(hourLabel)).toEqual([
      "9am",
      "11am",
      "1pm",
      "3pm",
      "5pm",
      "7pm",
    ])
  })

  it("handles midnight and noon", () => {
    expect(hourLabel(0)).toBe("12am")
    expect(hourLabel(12)).toBe("12pm")
    expect(hourLabel(23)).toBe("11pm")
  })
})
