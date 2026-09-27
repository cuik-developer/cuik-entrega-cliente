import { describe, expect, it } from "vitest"
import { utcToWallTime, wallTimeToUtc } from "./zoned-time"

describe("zoned-time", () => {
  it("04:17 in Lima is 09:17Z", () => {
    expect(wallTimeToUtc("2026-09-28T04:17", "America/Lima")?.toISOString()).toBe(
      "2026-09-28T09:17:00.000Z",
    )
  })
  it("round-trips through the tenant zone", () => {
    const iso = wallTimeToUtc("2026-09-28T04:17", "America/Lima") as Date
    expect(utcToWallTime(iso, "America/Lima")).toBe("2026-09-28T04:17")
  })
  it("handles DST zones", () => {
    expect(wallTimeToUtc("2026-07-01T09:00", "America/New_York")?.toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    )
    expect(wallTimeToUtc("2026-01-01T09:00", "America/New_York")?.toISOString()).toBe(
      "2026-01-01T14:00:00.000Z",
    )
  })
  it("rejects empty and malformed input", () => {
    expect(wallTimeToUtc("", "America/Lima")).toBeNull()
    expect(wallTimeToUtc("28/09/2026 04:17", "America/Lima")).toBeNull()
  })
})
