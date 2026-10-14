import { describe, expect, it } from "vitest"
import { pipelineSummary, prospectMonthlyPen, prospectsToExpected } from "./prospects"

const dfrios = {
  stage: "demo_scheduled" as const,
  probability: 50,
  monthlyAmount: 79,
  currency: "PEN" as const,
  intervalMonths: 1,
  billingMode: "arrears" as const,
  expectedStartMonth: "2026-11",
  demoEndOn: "2026-10-16",
  nextStepOn: "2026-10-16",
}
const clarito = {
  ...dfrios,
  probability: 60,
  expectedStartMonth: "2026-11",
  demoEndOn: "2026-10-31",
}
const annualUsd = {
  ...dfrios,
  stage: "proposal" as const,
  probability: 80,
  monthlyAmount: 1200,
  currency: "USD" as const,
  intervalMonths: 12,
  billingMode: "advance" as const,
  expectedStartMonth: "2026-09",
  demoEndOn: null,
  nextStepOn: null,
}

describe("prospects", () => {
  it("monthly value in soles divides the invoice by its interval and converts USD", () => {
    expect(prospectMonthlyPen(dfrios, 3.44)).toBe(79)
    expect(prospectMonthlyPen(annualUsd, 3.44)).toBe(344) // 1200 × 3.44 / 12
    expect(prospectMonthlyPen({ ...dfrios, monthlyAmount: null }, 3.44)).toBe(0)
  })

  it("pipeline: weighted and full monthly value, demos ending, steps due", () => {
    const s = pipelineSummary(
      [dfrios, clarito, annualUsd, { ...dfrios, stage: "lost" }, { ...dfrios, stage: "won" }],
      3.44,
      "2026-10-13",
    )
    expect(s.open).toBe(3)
    expect(s.inDemo).toBe(2)
    expect(s.won).toBe(1)
    expect(s.lost).toBe(1)
    expect(s.fullMonthlyPen).toBe(79 + 79 + 344)
    expect(s.weightedMonthlyPen).toBe(39.5 + 47.4 + 275.2)
    expect(s.demosEnding).toBe(1) // D'Frios on the 16th; Don Clarito on the 31st is beyond 7 days
    expect(s.stepsDue).toBe(0)
    expect(pipelineSummary([dfrios], 3.44, "2026-10-16").stepsDue).toBe(1)
  })

  it("open prospects enter the projection weighted, never before next month", () => {
    const exp = prospectsToExpected([dfrios, annualUsd, { ...dfrios, stage: "won" }], "2026-10")
    expect(exp).toHaveLength(2)
    expect(exp[0]).toMatchObject({ amount: 39.5, startMonth: "2026-11", firstUncovered: "2026-11" })
    // Expected start in September is behind: it starts in November, still annual in advance.
    expect(exp[1]).toMatchObject({
      amount: 960,
      currency: "USD",
      intervalMonths: 12,
      billingMode: "advance",
      startMonth: "2026-11",
    })
    expect(prospectsToExpected([{ ...dfrios, expectedStartMonth: null }], "2026-10")).toEqual([])
    expect(prospectsToExpected([{ ...dfrios, probability: 0 }], "2026-10")).toEqual([])
  })
})
