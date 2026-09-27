import { describe, expect, it } from "vitest"
import {
  addDays,
  computeExpiresAt,
  formatExpiry,
  lastValidDay,
  localMidnight,
  nthWeekdayOfMonth,
} from "./expiration"

const TZ = "America/Lima" // UTC-5, no DST

describe("localMidnight", () => {
  it("returns 05:00Z for a Lima midnight", () => {
    expect(localMidnight("2026-10-02", TZ).toISOString()).toBe("2026-10-02T05:00:00.000Z")
  })
  it("handles a DST zone", () => {
    expect(localMidnight("2026-07-01", "America/New_York").toISOString()).toBe(
      "2026-07-01T04:00:00.000Z",
    )
    expect(localMidnight("2026-01-01", "America/New_York").toISOString()).toBe(
      "2026-01-01T05:00:00.000Z",
    )
  })
})

describe("nthWeekdayOfMonth", () => {
  // October 2026 starts on a Thursday.
  it("first Thursday when the month starts on Thursday", () => {
    expect(nthWeekdayOfMonth("2026-10-15", 4, 1)).toBe("2026-10-01")
  })
  // November 2026 starts on a Sunday.
  it("first Thursday when the month starts on Sunday", () => {
    expect(nthWeekdayOfMonth("2026-11-01", 4, 1)).toBe("2026-11-05")
  })
  it("last Friday of October 2026", () => {
    expect(nthWeekdayOfMonth("2026-10-01", 5, "last")).toBe("2026-10-30")
  })
  it("fourth Monday of February 2026", () => {
    expect(nthWeekdayOfMonth("2026-02-10", 1, 4)).toBe("2026-02-23")
  })
})

describe("lastValidDay", () => {
  it("never", () => {
    expect(lastValidDay({ mode: "never" }, "2026-09-28")).toBeNull()
  })
  it("rolling 7 days: earned Monday, valid through next Monday", () => {
    expect(lastValidDay({ mode: "rolling", days: 7 }, "2026-09-28")).toBe("2026-10-05")
  })
  it("weekly Thursday: earned Monday -> that Thursday", () => {
    expect(lastValidDay({ mode: "weekly", weekday: 4 }, "2026-09-28")).toBe("2026-10-01")
  })
  it("weekly Thursday: earned Thursday -> next Thursday", () => {
    expect(lastValidDay({ mode: "weekly", weekday: 4 }, "2026-10-01")).toBe("2026-10-08")
  })
  it("monthly first Thursday: earned before it -> same month", () => {
    expect(lastValidDay({ mode: "monthly", weekday: 4, ordinal: 1 }, "2026-11-02")).toBe(
      "2026-11-05",
    )
  })
  it("monthly first Thursday: earned on it -> next month", () => {
    expect(lastValidDay({ mode: "monthly", weekday: 4, ordinal: 1 }, "2026-10-01")).toBe(
      "2026-11-05",
    )
  })
  it("monthly first Thursday: earned after it -> next month", () => {
    expect(lastValidDay({ mode: "monthly", weekday: 4, ordinal: 1 }, "2026-10-20")).toBe(
      "2026-11-05",
    )
  })
  it("interval 7 days from an anchor", () => {
    const p = { mode: "interval" as const, days: 7, anchor: "2026-09-21" }
    expect(lastValidDay(p, "2026-09-21")).toBe("2026-09-27")
    expect(lastValidDay(p, "2026-09-26")).toBe("2026-09-27")
    // Earned on the period's last day -> next period.
    expect(lastValidDay(p, "2026-09-27")).toBe("2026-10-04")
    expect(lastValidDay(p, "2026-10-01")).toBe("2026-10-04")
  })
})

describe("computeExpiresAt", () => {
  it("is the Lima midnight after the last valid day", () => {
    // Earned Thursday Oct 1 at 20:00 Lima (01:00Z Oct 2), weekly Thursday cutoff.
    const earned = new Date("2026-10-02T01:00:00.000Z")
    const at = computeExpiresAt({ mode: "weekly", weekday: 4 }, earned, TZ)
    expect(at?.toISOString()).toBe("2026-10-09T05:00:00.000Z")
    expect(formatExpiry(at as Date, TZ)).toMatch(/jue.*8.*oct/)
  })
  it("uses the local date, not the UTC date", () => {
    // 23:30 Lima on Sep 28 is 04:30Z on Sep 29. Rolling 1 day -> valid through Sep 29.
    const earned = new Date("2026-09-29T04:30:00.000Z")
    expect(computeExpiresAt({ mode: "rolling", days: 1 }, earned, TZ)?.toISOString()).toBe(
      "2026-09-30T05:00:00.000Z",
    )
  })
  it("addDays crosses month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02")
  })
})
