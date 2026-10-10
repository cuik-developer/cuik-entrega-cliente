import { describe, expect, it } from "vitest"
import {
  bucketStart,
  buildBuckets,
  defaultGranularity,
  fillSeries,
  rangeDays,
} from "./trend-buckets"

describe("rangeDays", () => {
  it("is inclusive", () => {
    expect(rangeDays("2026-01-01", "2026-01-01")).toBe(1)
    expect(rangeDays("2026-01-01", "2026-01-31")).toBe(31)
    expect(rangeDays("2024-02-28", "2024-03-01")).toBe(3) // leap day
  })
})

describe("bucketStart", () => {
  it("returns the day itself for day granularity", () => {
    expect(bucketStart("2026-10-09", "day")).toBe("2026-10-09")
  })

  it("returns the Monday of the ISO week (like date_trunc('week'))", () => {
    expect(bucketStart("2026-10-09", "week")).toBe("2026-10-05") // Friday -> Monday
    expect(bucketStart("2026-10-05", "week")).toBe("2026-10-05") // Monday stays
    expect(bucketStart("2026-10-11", "week")).toBe("2026-10-05") // Sunday -> previous Monday
  })

  it("returns the first of the month", () => {
    expect(bucketStart("2026-10-09", "month")).toBe("2026-10-01")
  })
})

describe("buildBuckets", () => {
  it("lists every day in range", () => {
    expect(buildBuckets("2026-01-30", "2026-02-02", "day")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ])
  })

  it("starts weeks on the Monday containing `from` and stops after `to`", () => {
    expect(buildBuckets("2026-10-07", "2026-10-20", "week")).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ])
  })

  it("lists month starts across a year boundary", () => {
    expect(buildBuckets("2025-11-15", "2026-02-03", "month")).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ])
  })
})

describe("fillSeries", () => {
  it("zero-fills missing buckets and ignores rows outside them", () => {
    const buckets = ["2026-01-01", "2026-01-02", "2026-01-03"]
    expect(
      fillSeries(buckets, [
        { date: "2026-01-01", value: 4 },
        { date: "2026-01-03", value: 2 },
        { date: "2025-12-31", value: 99 },
      ]),
    ).toEqual([4, 0, 2])
  })

  it("sums duplicate dates", () => {
    expect(
      fillSeries(
        ["2026-01-01"],
        [
          { date: "2026-01-01", value: 1 },
          { date: "2026-01-01", value: 2 },
        ],
      ),
    ).toEqual([3])
  })
})

describe("defaultGranularity", () => {
  it("picks day / week / month by span", () => {
    expect(defaultGranularity(7)).toBe("day")
    expect(defaultGranularity(31)).toBe("day")
    expect(defaultGranularity(90)).toBe("week")
    expect(defaultGranularity(365)).toBe("month")
  })
})
