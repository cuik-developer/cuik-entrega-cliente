import { generateStripImage } from "@cuik/wallet/apple"
import sharp from "sharp"

/**
 * Strip images for an Apple pass, for both program types.
 *
 * The routes used to do `if (stripBg && stamp) generateStripImage(...) else
 * transparent`, and to label every background as `data:image/png` — so a
 * POINTS design (which has no stamp asset) lost its background entirely, and a
 * JPG background could make librsvg render nothing. This helper:
 *   - points: background alone, resized to cover 750×246 (no stamps drawn)
 *   - stamps: background + stamp grid via generateStripImage (unchanged)
 *   - sniffs the real image type for the data URI
 *   - falls back to a transparent strip only when there is no background at all
 */

export const STRIP_W_2X = 750
export const STRIP_H_2X = 246

export type StripGridLayout = {
  cols: number
  rows: number
  stampSize: number
  offsetX: number
  offsetY: number
  gapX: number
  gapY: number
  filledOpacity: number
  emptyOpacity: number
  fillOrder: "row" | "interleaved"
  rowOffsets?: Array<{ x: number; y: number }>
}

/** PNG / JPEG / WebP by magic bytes; defaults to PNG. */
export function sniffImageMime(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"
  }
  return "image/png"
}

export function toDataUri(buf: Buffer): string {
  return `data:${sniffImageMime(buf)};base64,${buf.toString("base64")}`
}

async function transparentStrip(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer()
}

/** Background only (points passes): cover-fit to the strip box, PNG out. */
export async function buildBackgroundOnlyStrip(
  background: Buffer,
): Promise<{ strip2x: Buffer; strip1x: Buffer }> {
  const strip2x = await sharp(background)
    .resize(STRIP_W_2X, STRIP_H_2X, { fit: "cover", position: "centre" })
    .png()
    .toBuffer()
  const strip1x = await sharp(strip2x)
    .resize(STRIP_W_2X / 2, STRIP_H_2X / 2)
    .png()
    .toBuffer()
  return { strip2x, strip1x }
}

export async function buildStripImages(params: {
  programType: "stamps" | "points"
  background: Buffer | null
  stamp: Buffer | null
  stampsInCycle: number
  maxVisits: number
  gridLayout?: StripGridLayout
}): Promise<{ strip2x: Buffer; strip1x: Buffer }> {
  const { programType, background, stamp } = params

  if (background && programType === "points") {
    return buildBackgroundOnlyStrip(background)
  }

  if (background && stamp) {
    const result = await generateStripImage({
      backgroundImageDataUri: toDataUri(background),
      stampImageDataUri: toDataUri(stamp),
      stampsInCycle: params.stampsInCycle,
      maxVisits: params.maxVisits,
      gridLayout: params.gridLayout,
    })
    return { strip2x: result.strip2x, strip1x: result.strip1x }
  }

  if (background) {
    // Stamps program but the stamp asset is missing: better the background than nothing.
    return buildBackgroundOnlyStrip(background)
  }

  return {
    strip2x: await transparentStrip(STRIP_W_2X, STRIP_H_2X),
    strip1x: await transparentStrip(STRIP_W_2X / 2, STRIP_H_2X / 2),
  }
}
