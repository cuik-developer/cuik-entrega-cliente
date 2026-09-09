import { describe, expect, it } from "vitest"
import { DEFAULT_THRESHOLDS } from "@/lib/loyalty/client-segments"
import { SEGMENT_ORDER, tallySegments } from "./compute-segments"

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)

describe("tallySegments", () => {
  it("returns every segment (zero-filled) in a stable order and the total", () => {
    const out = tallySegments([], DEFAULT_THRESHOLDS)
    expect(out.total).toBe(0)
    expect(out.segments.map((s) => s.segment)).toEqual(SEGMENT_ORDER)
    expect(out.segments.every((s) => s.count === 0)).toBe(true)
  })

  it("accepts raw driver values (string avg, string timestamp) and buckets like the Clientes list", () => {
    const out = tallySegments(
      [
        // nuevo: registered yesterday
        { createdAt: daysAgo(1), totalVisits: 0, lastVisitAt: null, avgDaysBetweenVisits: null },
        // frecuente: 6 visits, avg 3 days, came yesterday — raw strings as node-pg sends them
        {
          createdAt: daysAgo(120),
          totalVisits: 6,
          lastVisitAt: daysAgo(1).toISOString().replace("T", " ").replace("Z", ""),
          avgDaysBetweenVisits: "3.0000",
        },
        // inactivo: never visited, old
        { createdAt: daysAgo(90), totalVisits: 0, lastVisitAt: null, avgDaysBetweenVisits: null },
        // regular: 2 visits
        {
          createdAt: daysAgo(60),
          totalVisits: 2,
          lastVisitAt: daysAgo(10),
          avgDaysBetweenVisits: "20",
        },
      ],
      DEFAULT_THRESHOLDS,
    )
    const byKey = Object.fromEntries(out.segments.map((s) => [s.segment, s.count]))
    expect(out.total).toBe(4)
    expect(byKey).toMatchObject({ nuevo: 1, frecuente: 1, inactivo: 1, regular: 1 })
  })
})
