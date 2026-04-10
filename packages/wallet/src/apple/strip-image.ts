import sharp from "sharp"

import {
  STAMP_GAP_X,
  STAMP_OPACITY_EMPTY,
  STAMP_OPACITY_FILLED,
  STAMP_SIZE,
  STAMP_START_X,
  STAMP_TOP_ROW_Y,
  STAMPS_PER_ROW,
  STRIP_HEIGHT_1X,
  STRIP_HEIGHT_2X,
  STRIP_WIDTH_1X,
  STRIP_WIDTH_2X,
} from "../shared/constants"
import type { StripImageParams, StripImageResult } from "../shared/types"

/**
 * Build an SVG string for the Apple Wallet strip image.
 *
 * Layout: background image fills the canvas, then stamp icons are overlaid
 * in a grid. Uses gridLayout from pass design when available, otherwise
 * falls back to hardcoded constants.
 */
function buildStripSvg(params: StripImageParams): string {
  const { backgroundImageDataUri, stampImageDataUri, stampsInCycle, maxVisits, gridLayout } = params

  // Use gridLayout from design or fall back to constants
  const cols = gridLayout?.cols ?? STAMPS_PER_ROW
  const stampSize = gridLayout?.stampSize ?? STAMP_SIZE
  const offsetX = gridLayout?.offsetX ?? STAMP_START_X
  const offsetY = gridLayout?.offsetY ?? STAMP_TOP_ROW_Y
  const gapX = gridLayout?.gapX ?? STAMP_GAP_X
  const gapY = gridLayout?.gapY ?? stampSize + 10
  const filledOpacity = gridLayout?.filledOpacity ?? STAMP_OPACITY_FILLED
  const emptyOpacity = gridLayout?.emptyOpacity ?? STAMP_OPACITY_EMPTY

  const fillOrder = gridLayout?.fillOrder ?? "row"
  const rows = gridLayout?.rows ?? Math.ceil(maxVisits / cols)
  const rowOffsets = gridLayout?.rowOffsets ?? []

  const stampElements = Array.from({ length: maxVisits }, (_, i) => {
    const row = fillOrder === "interleaved" ? i % rows : Math.floor(i / cols)
    const col = fillOrder === "interleaved" ? Math.floor(i / rows) : i % cols
    const rowOff = rowOffsets[row] ?? { x: 0, y: 0 }
    const x = offsetX + col * gapX + rowOff.x
    const y = offsetY + row * gapY + rowOff.y
    const opacity = i < stampsInCycle ? filledOpacity : emptyOpacity

    return `  <image href="${stampImageDataUri}" x="${x}" y="${y}" width="${stampSize}" height="${stampSize}" opacity="${opacity}" />`
  }).join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${STRIP_WIDTH_2X}" height="${STRIP_HEIGHT_2X}" viewBox="0 0 ${STRIP_WIDTH_2X} ${STRIP_HEIGHT_2X}">
  <image href="${backgroundImageDataUri}" x="0" y="0" width="${STRIP_WIDTH_2X}" height="${STRIP_HEIGHT_2X}" preserveAspectRatio="xMidYMid slice" />
${stampElements}
</svg>`
}

/**
 * Generate Apple Wallet strip images at @2x (750x246) and @1x (375x123).
 *
 * Builds an SVG with the stamp grid overlaid on the background image,
 * then converts to PNG via sharp. Pure buffer operations — no filesystem access.
 *
 * @param params - Background image, stamp image (as data URIs), stamp state
 * @returns Buffers for strip@2x.png and strip.png
 */
export async function generateStripImage(params: StripImageParams): Promise<StripImageResult> {
  const svg = buildStripSvg(params)

  const strip2x = await sharp(Buffer.from(svg)).png().toBuffer()
  const strip1x = await sharp(strip2x).resize(STRIP_WIDTH_1X, STRIP_HEIGHT_1X).png().toBuffer()

  return { strip2x, strip1x }
}

// Export for testing
export { buildStripSvg as _buildStripSvg }
