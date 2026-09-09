import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({
  db: {},
  eq: () => undefined,
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
  tenants: {},
  retentionCohorts: {},
}))

import { addMonths, monthsBetween } from "./calculate-retention"

describe("month arithmetic (string-only, timezone-proof)", () => {
  it("counts offsets across a year boundary", () => {
    expect(monthsBetween("2025-11-01", "2026-02-01")).toBe(3)
    expect(monthsBetween("2026-04-01", "2026-04-01")).toBe(0)
    expect(monthsBetween("2026-09-01", "2026-04-01")).toBe(-5)
  })

  it("adds months without touching Date", () => {
    expect(addMonths("2026-04-01", 0)).toBe("2026-04-01")
    expect(addMonths("2026-04-01", 5)).toBe("2026-09-01")
    expect(addMonths("2025-11-01", 3)).toBe("2026-02-01")
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01")
  })
})
