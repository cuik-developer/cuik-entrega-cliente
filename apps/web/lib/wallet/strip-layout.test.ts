import { describe, expect, it } from "vitest"
import { safeAssetUrl, stripCompleted, stripLayoutFrom, stripMaxVisits } from "./strip-layout"

describe("strip layout helpers", () => {
  it("promotion's maxVisits wins over the design's, with 8 as the last resort", () => {
    expect(stripMaxVisits({ maxVisits: 12 }, { maxVisits: 6 })).toBe(12)
    expect(stripMaxVisits({ maxVisits: null }, { maxVisits: 6 })).toBe(6)
    expect(stripMaxVisits(undefined, null)).toBe(8)
  })

  it("completed only for a real card: visits, empty cycle and a pending reward", () => {
    expect(stripCompleted(0, 1, 12)).toBe(true)
    expect(stripCompleted(3, 1, 15)).toBe(false)
    expect(stripCompleted(0, 0, 12)).toBe(false)
    expect(stripCompleted(0, 1, 0)).toBe(false) // brand-new client with a stray reward
  })

  it("tolerates old designs and junk in specialPositions", () => {
    expect(stripLayoutFrom(null)).toBeUndefined()
    const layout = stripLayoutFrom({ maxVisits: 10 })
    expect(layout?.cols).toBe(4)
    expect(layout?.specialPositions).toEqual([])
    expect(layout?.specialStampScale).toBe(100)
    expect(stripLayoutFrom({ maxVisits: 10, specialStampScale: 999 })?.specialStampScale).toBe(200)
    expect(
      stripLayoutFrom({ maxVisits: 10, specialPositions: [3, 0, 2.5, -1, 10] as number[] })
        ?.specialPositions,
    ).toEqual([3, 10])
  })

  it("only our own uploaded assets may be fetched for the special icon", () => {
    expect(safeAssetUrl("/api/assets/tenants/x/stamp-special.png")).toBe(
      "/api/assets/tenants/x/stamp-special.png",
    )
    expect(safeAssetUrl("https://evil.example/x.png")).toBeNull()
    expect(safeAssetUrl("/api/assets/../../.env")).toBeNull()
    expect(safeAssetUrl("/api/assets/a.png?x=1")).toBeNull()
    expect(safeAssetUrl("data:image/png;base64,AAAA")).toBeNull()
    expect(safeAssetUrl(null)).toBeNull()
  })
})
