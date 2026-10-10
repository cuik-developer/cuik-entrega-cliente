import { describe, expect, it } from "vitest"
import { resolveAllTimeRange, type TenantStartFacts } from "./dataset-columns"

const TZ = "America/Lima"
// 9 Oct 2026 02:30 UTC = 8 Oct 2026 21:30 in Lima: "today" must be the local day.
const NOW = new Date("2026-10-09T02:30:00Z")

const none: TenantStartFacts = {
  serviceStartOn: null,
  firstVisitAt: null,
  firstClientAt: null,
  tenantCreatedAt: null,
}

describe("resolveAllTimeRange", () => {
  it("ends today in the tenant timezone, not UTC", () => {
    expect(resolveAllTimeRange({ ...none, serviceStartOn: "2026-01-15" }, TZ, NOW)).toEqual({
      from: "2026-01-15",
      to: "2026-10-08",
    })
  })

  it("picks the earliest of service start, first visit and first client", () => {
    const facts: TenantStartFacts = {
      serviceStartOn: "2026-03-01",
      firstVisitAt: new Date("2026-02-20T15:00:00Z"),
      firstClientAt: new Date("2026-02-10T15:00:00Z"),
      tenantCreatedAt: new Date("2025-12-01T15:00:00Z"),
    }
    expect(resolveAllTimeRange(facts, TZ, NOW).from).toBe("2026-02-10")
  })

  it("converts the first visit to the tenant's local day", () => {
    // 1 Mar 2026 03:00 UTC is still 28 Feb in Lima.
    const facts: TenantStartFacts = { ...none, firstVisitAt: new Date("2026-03-01T03:00:00Z") }
    expect(resolveAllTimeRange(facts, TZ, NOW).from).toBe("2026-02-28")
  })

  it("falls back to the tenant creation when there is no service start nor data", () => {
    const facts: TenantStartFacts = { ...none, tenantCreatedAt: new Date("2026-05-05T12:00:00Z") }
    expect(resolveAllTimeRange(facts, TZ, NOW).from).toBe("2026-05-05")
  })

  it("uses today when nothing is known, never an inverted range", () => {
    expect(resolveAllTimeRange(none, TZ, NOW)).toEqual({ from: "2026-10-08", to: "2026-10-08" })
    // A service start in the future is clamped to today.
    expect(resolveAllTimeRange({ ...none, serviceStartOn: "2027-01-01" }, TZ, NOW)).toEqual({
      from: "2026-10-08",
      to: "2026-10-08",
    })
  })

  it("accepts a timestamp-shaped service start and ignores invalid dates", () => {
    const facts: TenantStartFacts = {
      ...none,
      serviceStartOn: "2026-04-01T00:00:00.000Z",
      firstVisitAt: new Date("not a date"),
    }
    expect(resolveAllTimeRange(facts, TZ, NOW).from).toBe("2026-04-01")
  })
})
