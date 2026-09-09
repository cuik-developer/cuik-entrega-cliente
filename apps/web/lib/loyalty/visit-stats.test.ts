import { clients, db, eq } from "@cuik/db"
import { describe, expect, it } from "vitest"
import { parseAvgDays, parseVisitDate, visitStatsSubquery } from "./visit-stats"

const TENANT = "00000000-0000-0000-0000-000000000001"

describe("visitStatsSubquery", () => {
  it('joins on the fully qualified clients.id (regression: bare "id" resolved to visits.id)', () => {
    const vs = visitStatsSubquery(TENANT)
    const { sql } = db
      .select({ id: clients.id, lastVisitAt: vs.lastVisitAt, avg: vs.avgDaysBetweenVisits })
      .from(clients)
      .leftJoin(vs, eq(vs.clientId, clients.id))
      .where(eq(clients.tenantId, TENANT))
      .toSQL()

    expect(sql).toContain('"visit_stats" on "visit_stats"."client_id" = "loyalty"."clients"."id"')
    expect(sql).toContain('as "last_visit_at"')
    expect(sql).toContain('as "avg_days_between_visits"')
    expect(sql).toContain('group by "loyalty"."visits"."client_id"')
    // The correlated-subquery form Drizzle used to collapse into this:
    expect(sql).not.toMatch(/"client_id"\s*=\s*"id"/)
  })

  it("scopes the aggregate to the tenant", () => {
    const vs = visitStatsSubquery(TENANT)
    const { sql, params } = db
      .select({ id: clients.id })
      .from(clients)
      .leftJoin(vs, eq(vs.clientId, clients.id))
      .toSQL()
    expect(sql).toContain('"tenant_id" = $1')
    expect(params[0]).toBe(TENANT)
  })
})

describe("parseVisitDate", () => {
  it("treats node-pg's zone-less timestamp string as UTC", () => {
    expect(parseVisitDate("2026-04-17 22:07:04.307")?.toISOString()).toBe(
      "2026-04-17T22:07:04.307Z",
    )
    expect(parseVisitDate("2026-04-17T22:07:04.307Z")?.toISOString()).toBe(
      "2026-04-17T22:07:04.307Z",
    )
  })

  it("passes Dates through and nulls the rest", () => {
    const d = new Date()
    expect(parseVisitDate(d)).toBe(d)
    expect(parseVisitDate(null)).toBeNull()
    expect(parseVisitDate("not a date")).toBeNull()
  })
})

describe("parseAvgDays", () => {
  it("parses PG numeric strings and keeps 0", () => {
    expect(parseAvgDays("2.4720899")).toBeCloseTo(2.472, 3)
    expect(parseAvgDays("0")).toBe(0)
    expect(parseAvgDays(3)).toBe(3)
  })

  it("returns null for null/undefined/garbage", () => {
    expect(parseAvgDays(null)).toBeNull()
    expect(parseAvgDays(undefined)).toBeNull()
    expect(parseAvgDays("abc")).toBeNull()
  })
})
