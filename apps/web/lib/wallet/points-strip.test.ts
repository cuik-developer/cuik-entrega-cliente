import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { buildStripImages, sniffImageMime, toDataUri } from "./points-strip"

async function solid(width: number, height: number, format: "png" | "jpeg"): Promise<Buffer> {
  const img = sharp({
    create: { width, height, channels: 3, background: { r: 14, g: 112, b: 219 } },
  })
  return format === "png" ? img.png().toBuffer() : img.jpeg().toBuffer()
}

describe("sniffImageMime", () => {
  it("tells PNG from JPEG by magic bytes", async () => {
    expect(sniffImageMime(await solid(4, 4, "png"))).toBe("image/png")
    expect(sniffImageMime(await solid(4, 4, "jpeg"))).toBe("image/jpeg")
    expect(toDataUri(await solid(4, 4, "jpeg")).startsWith("data:image/jpeg;base64,")).toBe(true)
  })
})

describe("buildStripImages", () => {
  it("points: uses the background alone, JPG included, cover-fit to 750×246 / 375×123", async () => {
    const bg = await solid(751, 247, "jpeg") // the user's odd-sized JPG
    const { strip2x, strip1x } = await buildStripImages({
      programType: "points",
      background: bg,
      stamp: null,
      stampsInCycle: 0,
      maxVisits: 0,
    })
    const m2 = await sharp(strip2x).metadata()
    const m1 = await sharp(strip1x).metadata()
    expect([m2.width, m2.height, m2.format]).toEqual([750, 246, "png"])
    expect([m1.width, m1.height, m1.format]).toEqual([375, 123, "png"])
  })

  it("no background at all: transparent strip of the right size", async () => {
    const { strip2x } = await buildStripImages({
      programType: "stamps",
      background: null,
      stamp: null,
      stampsInCycle: 0,
      maxVisits: 8,
    })
    const m = await sharp(strip2x).metadata()
    expect([m.width, m.height, m.hasAlpha]).toEqual([750, 246, true])
  })

  it("stamps without a stamp asset: keeps the background instead of blanking it", async () => {
    const { strip2x } = await buildStripImages({
      programType: "stamps",
      background: await solid(750, 246, "png"),
      stamp: null,
      stampsInCycle: 2,
      maxVisits: 8,
    })
    const { data } = await sharp(strip2x).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBe(14) // blue background survived
  })
})
