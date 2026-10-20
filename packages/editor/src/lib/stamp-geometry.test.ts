import { describe, expect, it } from "vitest"

import { getDefaultConfigV2 } from "./defaults"
import {
  effectiveMaxVisits,
  gridBounds,
  patchFromUi,
  stampOrigin,
  toUiValues,
} from "./stamp-geometry"

// Don Clarito as stored in prod (19 Oct 2026): pitch 124 with an 86 px stamp.
const donClarito = {
  maxVisits: 5,
  gridCols: 5,
  gridRows: 1,
  stampSize: 86,
  offsetX: 84,
  offsetY: 101,
  gapX: 124,
  gapY: 73,
}

describe("stamp geometry: UI ↔ stored pitch", () => {
  it("shows separations as pitch − size and margins as offsets", () => {
    expect(toUiValues(donClarito)).toEqual({
      size: 86,
      marginLeft: 84,
      marginTop: 101,
      sepX: 38,
      sepY: -13,
    })
  })

  it("stores the separation back as a pitch (decimals allowed)", () => {
    expect(patchFromUi(donClarito, "sepX", 38.8)).toEqual({ gapX: 124.8 })
    expect(patchFromUi({ ...donClarito, gridRows: 2, gapY: 120 }, "sepY", 10)).toEqual({ gapY: 96 })
  })

  it("round-trips the stored values unchanged", () => {
    const ui = toUiValues(donClarito)
    expect(patchFromUi(donClarito, "sepX", ui.sepX)).toEqual({ gapX: 124 })
    expect(patchFromUi(donClarito, "marginLeft", ui.marginLeft)).toEqual({ offsetX: 84 })
    expect(patchFromUi(donClarito, "marginTop", ui.marginTop)).toEqual({ offsetY: 101 })
  })

  it("keeps the separations when the stamp size changes (pitch recomputed)", () => {
    const cfg = { ...donClarito, gridRows: 2, gapY: 100 }
    const patch = patchFromUi(cfg, "size", 90)
    expect(patch).toEqual({ stampSize: 90, gapX: 128, gapY: 104 })
    const after = toUiValues({ ...cfg, ...patch })
    expect(after.sepX).toBe(38)
    expect(after.sepY).toBe(14)
    // margins are not touched
    expect(patch).not.toHaveProperty("offsetX")
  })

  it("clamps to the 750 × 288 strip and ignores NaN", () => {
    expect(patchFromUi(donClarito, "marginLeft", 900)).toEqual({ offsetX: 750 - 86 })
    expect(patchFromUi(donClarito, "marginTop", -5)).toEqual({ offsetY: 0 })
    expect(patchFromUi(donClarito, "size", 500)).toMatchObject({ stampSize: 200 })
    expect(patchFromUi(donClarito, "size", 2)).toMatchObject({ stampSize: 16 })
    expect(patchFromUi(donClarito, "sepX", Number.NaN)).toEqual({})
  })

  it("uses the server fallbacks for a legacy row with missing keys", () => {
    expect(toUiValues({ maxVisits: 8, gridCols: 4, gridRows: 2 })).toEqual({
      size: 63,
      marginLeft: 197,
      marginTop: 23,
      sepX: 35,
      sepY: 10,
    })
  })
})

describe("stamp origins and overflow", () => {
  it("places stamps like strip-image.ts (row and interleaved, with row offsets)", () => {
    expect(stampOrigin(donClarito, 4)).toEqual({ x: 84 + 4 * 124, y: 101 })
    const inter = {
      ...donClarito,
      gridCols: 5,
      gridRows: 2,
      gapY: 120,
      fillOrder: "interleaved" as const,
      rowOffsets: [
        { x: 0, y: 0 },
        { x: 62, y: 0 },
      ],
    }
    expect(stampOrigin(inter, 1)).toEqual({ x: 84 + 62, y: 101 + 120 })
    expect(stampOrigin(inter, 2)).toEqual({ x: 84 + 124, y: 101 })
  })

  it("flags a grid that leaves the strip", () => {
    expect(gridBounds(donClarito, 5).overflows).toBe(false)
    // a 6th column ends at 84 + 5·124 + 86 = 790 > 750
    expect(gridBounds({ ...donClarito, gridCols: 6 }, 6).overflows).toBe(true)
    // 7 stamps on 5×1: the extra ones go to a second row, 101 + 73 + 86 = 260 (still inside)
    expect(gridBounds(donClarito, 7).overflows).toBe(false)
  })
})

describe("effectiveMaxVisits", () => {
  it("prefers the promotion, then the design, then 8 (stripMaxVisits)", () => {
    expect(effectiveMaxVisits(10, 8)).toBe(10)
    expect(effectiveMaxVisits(null, 6)).toBe(6)
    expect(effectiveMaxVisits(undefined, undefined)).toBe(8)
  })
})

describe("new design defaults (750 × 288)", () => {
  it("fit inside the strip and keep a 41 px horizontal separation", () => {
    const cfg = getDefaultConfigV2("Comercio").stampsConfig
    expect(cfg).toMatchObject({ stampSize: 74, offsetX: 166, offsetY: 27, gapX: 115, gapY: 85 })
    expect(toUiValues(cfg).sepX).toBe(41)
    expect(gridBounds(cfg, 8).overflows).toBe(false)
  })
})
