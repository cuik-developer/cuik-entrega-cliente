import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({
  db: {},
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
  visitsDaily: {},
}))

import { daysToAggregate } from "./aggregate-visits-daily"

describe("daysToAggregate", () => {
  it("returns yesterday and the days before, oldest first, never today", () => {
    expect(daysToAggregate("2026-09-09", 3)).toEqual(["2026-09-06", "2026-09-07", "2026-09-08"])
    expect(daysToAggregate("2026-09-09", 1)).toEqual(["2026-09-08"])
  })

  it("crosses month and year boundaries on the calendar, not on a timezone", () => {
    expect(daysToAggregate("2026-03-01", 2)).toEqual(["2026-02-27", "2026-02-28"])
    expect(daysToAggregate("2027-01-01", 1)).toEqual(["2026-12-31"])
  })
})
