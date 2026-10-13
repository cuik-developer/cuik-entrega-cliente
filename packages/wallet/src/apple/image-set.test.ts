import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { buildIconSet, buildLogoSet } from "./image-set"

/** A wide, heavy image like a horizontal brand logo uploaded as the pass icon. */
async function horizontalLogo(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2000,
      height: 700,
      channels: 4,
      background: { r: 230, g: 80, b: 30, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
}

describe("buildIconSet", () => {
  it("renders 29/58/87 px squares, letter-boxed with transparency, far lighter than the source", async () => {
    const src = await horizontalLogo()
    const icons = await buildIconSet(src)
    for (const [k, px] of [
      ["1x", 29],
      ["2x", 58],
      ["3x", 87],
    ] as const) {
      const m = await sharp(icons[k]).metadata()
      expect([m.width, m.height, m.format]).toEqual([px, px, "png"])
      expect(m.hasAlpha).toBe(true)
      expect(icons[k].byteLength).toBeLessThan(src.byteLength / 10)
    }
    // Letter-boxed: the top row of the 3x icon is transparent (image is wider than tall).
    const { data, info } = await sharp(icons["3x"]).raw().toBuffer({ resolveWithObject: true })
    const alphaTopLeft = data[3]
    const alphaCenter =
      data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3]
    expect(alphaTopLeft).toBe(0)
    expect(alphaCenter).toBe(255)
  })

  it("keeps a square icon as is", async () => {
    const src = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer()
    const icons = await buildIconSet(src)
    const { data } = await sharp(icons["2x"]).raw().toBuffer({ resolveWithObject: true })
    expect(data[3]).toBe(255) // no letter-box
  })
})

describe("fallback", () => {
  it("ships the original bytes when the upload is not an image", async () => {
    const junk = Buffer.from("not an image")
    const icons = await buildIconSet(junk)
    expect(icons["1x"]).toBe(junk)
    expect(icons["3x"]).toBe(junk)
  })
})

describe("buildLogoSet", () => {
  it("renders 160×50 point boxes at the three scales", async () => {
    const logos = await buildLogoSet(await horizontalLogo())
    expect(
      await Promise.all(
        (["1x", "2x", "3x"] as const).map(async (k) => {
          const m = await sharp(logos[k]).metadata()
          return [m.width, m.height]
        }),
      ),
    ).toEqual([
      [160, 50],
      [320, 100],
      [480, 150],
    ])
  })
})
