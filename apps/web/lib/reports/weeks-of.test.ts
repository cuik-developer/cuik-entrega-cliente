import { describe, expect, it } from "vitest"
import { type DailyRow, weeksOf } from "./compute-report"
import { eachDay, weekdayName } from "./period"

function day(date: string, visits: number): DailyRow {
  return {
    date,
    weekday: weekdayName(date),
    visits,
    uniqueClients: visits,
    newClients: visits > 3 ? 1 : 0,
    rewardsRedeemed: 0,
    peakHour: null,
  }
}

describe("weeksOf", () => {
  it("splits September 2026 (starts on a Tuesday) into 5 Monday-based weeks", () => {
    const daily = eachDay("2026-09-01", "2026-09-30").map((d, i) => day(d, i + 1))
    const weeks = weeksOf(daily)
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-09-01", "2026-09-06"],
      ["2026-09-07", "2026-09-13"],
      ["2026-09-14", "2026-09-20"],
      ["2026-09-21", "2026-09-27"],
      ["2026-09-28", "2026-09-30"],
    ])
    expect(weeks[0].label).toBe("Semana 1 (1 al 6)")
    expect(weeks[0].visits).toBe(1 + 2 + 3 + 4 + 5 + 6)
    expect(weeks.reduce((s, w) => s + w.visits, 0)).toBe(daily.reduce((s, d) => s + d.visits, 0))
  })
})
