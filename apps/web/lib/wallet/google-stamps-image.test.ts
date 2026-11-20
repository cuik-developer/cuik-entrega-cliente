import { describe, expect, it } from "vitest"

import {
  parseStampsImageFile,
  type StampsImageSource,
  stampsImageHash,
  stampsImagePath,
  stampsImageState,
} from "./google-stamps-image"

const DESIGN = "0b6e2f3a-1c4d-4e5f-8a9b-0c1d2e3f4a5b"

function source(overrides: Partial<StampsImageSource> = {}): StampsImageSource {
  return {
    designId: DESIGN,
    stripBgUrl: "/api/assets/tenants/t/assets/bg.png",
    stampUrl: "/api/assets/tenants/t/assets/stamp.png",
    stampsConfig: { maxVisits: 6, gridCols: 3, gridRows: 2, stampSize: 70 },
    maxVisits: 6,
    ...overrides,
  }
}

describe("stampsImageHash", () => {
  it("is stable for the same design", () => {
    expect(stampsImageHash(source())).toBe(stampsImageHash(source()))
    expect(stampsImageHash(source())).toMatch(/^[0-9a-f]{12}$/)
  })

  it("changes with anything the picture is drawn from", () => {
    const base = stampsImageHash(source())
    const changed = [
      source({ stripBgUrl: "/api/assets/tenants/t/assets/bg-2.png" }),
      source({ stampUrl: "/api/assets/tenants/t/assets/stamp-2.png" }),
      source({ maxVisits: 8 }),
      source({ stampsConfig: { maxVisits: 6, gridCols: 3, gridRows: 2, stampSize: 71 } }),
      source({
        stampsConfig: { maxVisits: 6, gridCols: 3, gridRows: 2, stampSize: 70, offsetX: 10 },
      }),
      source({
        stampsConfig: {
          maxVisits: 6,
          gridCols: 3,
          gridRows: 2,
          stampSize: 70,
          specialPositions: [3],
        },
      }),
      source({
        stampsConfig: {
          maxVisits: 6,
          gridCols: 3,
          gridRows: 2,
          stampSize: 70,
          specialStampUrl: "/api/assets/tenants/t/assets/gift.png",
        },
      }),
    ]
    for (const s of changed) expect(stampsImageHash(s)).not.toBe(base)
  })

  it("ignores what the picture does not use", () => {
    // The design's own maxVisits is not drawn: the promotion's count is (source.maxVisits).
    const other = source({
      stampsConfig: { maxVisits: 8, gridCols: 3, gridRows: 2, stampSize: 70 },
    })
    expect(stampsImageHash(other)).toBe(stampsImageHash(source()))
    // A special icon outside our own assets is never loaded, so it cannot change the picture.
    const external = source({
      stampsConfig: {
        maxVisits: 6,
        gridCols: 3,
        gridRows: 2,
        stampSize: 70,
        specialStampUrl: "https://example.com/x.png",
      },
    })
    expect(stampsImageHash(external)).toBe(stampsImageHash(source()))
  })
})

describe("stampsImageState", () => {
  const client = (stampsInCycle: number, pendingRewards = 0, totalVisits = stampsInCycle) => ({
    stampsInCycle,
    pendingRewards,
    totalVisits,
  })

  it("is the stamps of the current card", () => {
    expect(stampsImageState(6, client(0))).toBe(0)
    expect(stampsImageState(6, client(3))).toBe(3)
    expect(stampsImageState(6, client(5))).toBe(5)
  })

  it("draws the completed card full while the reward is pending, like Apple", () => {
    expect(stampsImageState(6, client(0, 1, 6))).toBe("full")
    // Reward redeemed: back to an empty card.
    expect(stampsImageState(6, client(0, 0, 6))).toBe(0)
    // A stray pending reward with no visits keeps an empty card.
    expect(stampsImageState(6, client(0, 1, 0))).toBe(0)
    // Already stamping the next card: the pending reward does not fill it.
    expect(stampsImageState(6, client(2, 1, 8))).toBe(2)
  })

  it("never names a state outside the card", () => {
    expect(stampsImageState(6, client(9))).toBe(5)
    expect(stampsImageState(6, client(-2))).toBe(0)
    expect(stampsImageState(0, client(3))).toBe(0)
  })
})

describe("image address", () => {
  it("round-trips through the file name", () => {
    const hash = stampsImageHash(source())
    for (const state of [0, 3, 12, "full"] as const) {
      const path = stampsImagePath(DESIGN, hash, state)
      expect(path.startsWith(`/api/public/google-stamps/${DESIGN}/`)).toBe(true)
      expect(parseStampsImageFile(path.split("/").at(-1) ?? "")).toEqual({ hash, state })
    }
  })

  it("carries no client data: same state, same address", () => {
    const hash = stampsImageHash(source())
    expect(stampsImagePath(DESIGN, hash, 3)).toBe(stampsImagePath(DESIGN, hash, 3))
  })

  it("rejects anything that is not one of our file names", () => {
    for (const file of [
      "",
      "3.png",
      "abcdefabcdef-3.jpg",
      "abcdefabcdef-3.png/..",
      "ABCDEFABCDEF-3.png",
      "abcdefabcdef--1.png",
      "abcdefabcdef-1234.png",
      "abcdefabcde-3.png",
      "abcdefabcdef-full.png.png",
    ]) {
      expect(parseStampsImageFile(file)).toBeNull()
    }
  })
})
