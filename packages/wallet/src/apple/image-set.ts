import sharp from "sharp"

/**
 * Apple Wallet image sets.
 *
 * Wallet reads images at three scales. iPhones pick `@3x`/`@2x` first and
 * only fall back to the 1x file when the others are missing. We used to ship
 * one `icon.png` with whatever the tenant uploaded (sometimes 140 KB and
 * horizontal); this renders every variant at the point sizes Apple lists for
 * store cards and keeps the uploaded aspect ratio inside the box.
 *
 * Sizes in points (1x) from the Pass Design guide:
 *   icon 29×29 · logo up to 160×50
 */
const ICON_PT = 29
const LOGO_PT = { width: 160, height: 50 }
const SCALES = [1, 2, 3] as const

export type ScaledImages = Record<"1x" | "2x" | "3x", Buffer>

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

async function fitInto(src: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(src)
    .resize({ width, height, fit: "contain", background: transparent, withoutEnlargement: false })
    .png()
    .toBuffer()
}

/**
 * If sharp cannot read the upload (corrupt file, exotic SVG), fall back to
 * shipping the original bytes at every scale, which is what the pass did
 * before: a bad logo must not stop the pass from being issued.
 */
async function setOrFallback(
  src: Buffer,
  box: (scale: number) => { width: number; height: number },
  what: string,
): Promise<ScaledImages> {
  try {
    const [a, b, c] = await Promise.all(
      SCALES.map((s) => {
        const { width, height } = box(s)
        return fitInto(src, width, height)
      }),
    )
    return { "1x": a, "2x": b, "3x": c }
  } catch (err) {
    console.warn(`[Wallet:Images] ${what} could not be resized, shipping the original:`, err)
    return { "1x": src, "2x": src, "3x": src }
  }
}

/** Square icon set: 29, 58 and 87 px. A horizontal image is letter-boxed, not stretched. */
export function buildIconSet(src: Buffer): Promise<ScaledImages> {
  return setOrFallback(src, (s) => ({ width: ICON_PT * s, height: ICON_PT * s }), "icon")
}

/** Logo set: 160×50, 320×100 and 480×150 px boxes (the image keeps its proportion inside). */
export function buildLogoSet(src: Buffer): Promise<ScaledImages> {
  return setOrFallback(
    src,
    (s) => ({ width: LOGO_PT.width * s, height: LOGO_PT.height * s }),
    "logo",
  )
}
