import { describe, expect, it } from "vitest"
import {
  addDays,
  delta,
  deltaShort,
  eachDay,
  eachMonth,
  isoWeekday,
  lastClosedMonth,
  lastClosedWeek,
  monthLabel,
  previousMonth,
  previousWeek,
  sameMonthLastYear,
  weekLabel,
} from "./period"

describe("date math", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29")
  })

  it("iso weekday: Monday = 1, Sunday = 7", () => {
    expect(isoWeekday("2026-09-07")).toBe(1) // Monday
    expect(isoWeekday("2026-09-13")).toBe(7) // Sunday
  })

  it("eachDay is inclusive on both ends", () => {
    expect(eachDay("2026-09-07", "2026-09-13")).toHaveLength(7)
    expect(eachDay("2026-09-07", "2026-09-07")).toEqual(["2026-09-07"])
  })
})

describe("closed periods", () => {
  it("on a Monday, last closed week is the week that just ended", () => {
    expect(lastClosedWeek("2026-09-14")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
      key: "2026-09-07",
    })
  })

  it("mid-week, last closed week is still the previous Monday–Sunday", () => {
    expect(lastClosedWeek("2026-09-16")).toEqual({
      start: "2026-09-07",
      end: "2026-09-13",
      key: "2026-09-07",
    })
    expect(lastClosedWeek("2026-09-13")).toEqual({
      start: "2026-08-31",
      end: "2026-09-06",
      key: "2026-08-31",
    })
  })

  it("previous week shifts by 7 days", () => {
    expect(previousWeek({ start: "2026-09-07", end: "2026-09-13", key: "2026-09-07" })).toEqual({
      start: "2026-08-31",
      end: "2026-09-06",
      key: "2026-08-31",
    })
  })

  it("last closed month handles January and February lengths", () => {
    expect(lastClosedMonth("2026-01-01")).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
      key: "2025-12",
    })
    expect(lastClosedMonth("2026-03-15")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
      key: "2026-02",
    })
    expect(lastClosedMonth("2028-03-15").end).toBe("2028-02-29")
  })

  it("previous month and same month last year", () => {
    const sep = { start: "2026-09-01", end: "2026-09-30", key: "2026-09" }
    expect(previousMonth(sep).key).toBe("2026-08")
    expect(sameMonthLastYear(sep)).toEqual({
      start: "2025-09-01",
      end: "2025-09-30",
      key: "2025-09",
    })
  })

  it("eachMonth spans years", () => {
    expect(eachMonth("2025-11-20", "2026-02-03")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ])
  })
})

describe("labels", () => {
  it("week inside one month", () => {
    expect(weekLabel({ start: "2026-09-07", end: "2026-09-13", key: "2026-09-07" })).toBe(
      "lunes 7 al domingo 13 de setiembre de 2026",
    )
  })
  it("week across months", () => {
    expect(weekLabel({ start: "2026-09-28", end: "2026-10-04", key: "2026-09-28" })).toBe(
      "lunes 28 de setiembre al domingo 4 de octubre de 2026",
    )
  })
  it("month", () => {
    expect(monthLabel({ start: "2026-09-01", end: "2026-09-30", key: "2026-09" })).toBe(
      "setiembre de 2026",
    )
  })
})

describe("delta", () => {
  it("percent with a base, absolute without, never 'sin base'", () => {
    expect(delta(42, 37)).toEqual({ direction: "up", text: "+14 % · antes 37", pct: 14 })
    expect(delta(30, 40)).toEqual({ direction: "down", text: "-25 % · antes 40", pct: -25 })
    expect(delta(9, 0)).toEqual({ direction: "up", text: "+9 · antes 0", pct: null })
    expect(delta(5, 5).direction).toBe("flat")
  })
  it("short form for subjects", () => {
    expect(deltaShort(42, 37)).toBe("+14 %")
    expect(deltaShort(9, 0)).toBe("+9")
    expect(deltaShort(5, 5)).toBe("sin cambio")
  })
})
