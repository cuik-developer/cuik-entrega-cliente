import { describe, expect, it } from "vitest"
import { computeClientSegment, DEFAULT_THRESHOLDS, getThresholds } from "./client-segments"

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)

describe("computeClientSegment", () => {
  it("nuevo: registered within newClientDays, regardless of visits", () => {
    expect(
      computeClientSegment({
        createdAt: daysAgo(2),
        totalVisits: 0,
        lastVisitAt: null,
        avgDaysBetweenVisits: null,
      }),
    ).toBe("nuevo")
    expect(
      computeClientSegment({
        createdAt: daysAgo(2),
        totalVisits: 5,
        lastVisitAt: daysAgo(0),
        avgDaysBetweenVisits: 0.4,
      }),
    ).toBe("nuevo")
  })

  it("stops being nuevo after newClientDays even with 0-1 visits", () => {
    expect(
      computeClientSegment({
        createdAt: daysAgo(DEFAULT_THRESHOLDS.newClientDays + 1),
        totalVisits: 1,
        lastVisitAt: daysAgo(3),
        avgDaysBetweenVisits: null,
      }),
    ).toBe("regular")
  })

  it("regular: 2 visits after the new window", () => {
    expect(
      computeClientSegment({
        createdAt: daysAgo(60),
        totalVisits: 2,
        lastVisitAt: daysAgo(10),
        avgDaysBetweenVisits: 20,
      }),
    ).toBe("regular")
  })

  it("regular (not nuevo) when visit stats are missing for a client with 3+ visits", () => {
    // This is the exact shape the list route produced while the correlated
    // subquery bug was live: stats NULL for everyone. It must never read "Nuevo".
    expect(
      computeClientSegment({
        createdAt: daysAgo(155),
        totalVisits: 5,
        lastVisitAt: null,
        avgDaysBetweenVisits: null,
      }),
    ).toBe("regular")
  })

  it("inactivo: 0 visits and older than oneTimeInactiveDays", () => {
    expect(
      computeClientSegment({
        createdAt: daysAgo(DEFAULT_THRESHOLDS.oneTimeInactiveDays + 5),
        totalVisits: 0,
        lastVisitAt: null,
        avgDaysBetweenVisits: null,
      }),
    ).toBe("inactivo")
  })

  it("one_time: exactly 1 visit, oneTimeInactiveDays+ ago", () => {
    expect(
      computeClientSegment({
        createdAt: daysAgo(90),
        totalVisits: 1,
        lastVisitAt: daysAgo(DEFAULT_THRESHOLDS.oneTimeInactiveDays + 1),
        avgDaysBetweenVisits: null,
      }),
    ).toBe("one_time")
  })

  it("frecuente / en_riesgo / esporadico from visit rhythm", () => {
    const base = { createdAt: daysAgo(120), totalVisits: 6 }
    expect(
      computeClientSegment({ ...base, lastVisitAt: daysAgo(1), avgDaysBetweenVisits: 3 }),
    ).toBe("frecuente")
    expect(
      computeClientSegment({ ...base, lastVisitAt: daysAgo(30), avgDaysBetweenVisits: 3 }),
    ).toBe("en_riesgo")
    expect(
      computeClientSegment({ ...base, lastVisitAt: daysAgo(30), avgDaysBetweenVisits: 20 }),
    ).toBe("esporadico")
  })

  it("frutti (prod case): 5 visits over 10 days in April, silent since → en_riesgo", () => {
    const first = new Date("2026-04-08T00:47:50Z")
    const last = new Date("2026-04-17T22:07:04Z")
    const avg = (last.getTime() - first.getTime()) / 4 / DAY
    const segment = computeClientSegment(
      { createdAt: first, totalVisits: 5, lastVisitAt: last, avgDaysBetweenVisits: avg },
      getThresholds("Cafeteria"),
    )
    // Any run after mid-May 2026 sees >3× the 2.5-day average without a visit.
    expect(segment).toBe("en_riesgo")
  })
})
