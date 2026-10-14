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
 * Gift badge drawn on a special stamp when the design has no icon of its own:
 * an orange disc with a white star at the stamp's top-right corner. A little
 * dimmer while the stamp is still empty, but never faded out, so the client
 * sees where the gifts are from the first day.
 */
function giftBadge(x: number, y: number, stampSize: number, filled: boolean): string {
  const r = Math.max(6, Math.round(stampSize * 0.22))
  const cx = x + stampSize - r * 0.9
  // Never above the strip: clamp so the disc stays inside the canvas.
  const cy = Math.max(r, y + r * 0.9)
  const star = Array.from({ length: 10 }, (_, k) => {
    const radius = k % 2 === 0 ? r * 0.58 : r * 0.26
    const angle = -Math.PI / 2 + (k * Math.PI) / 5
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`
  }).join(" ")
  return `  <g opacity="${filled ? 1 : 0.85}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#FF4810" stroke="#FFFFFF" stroke-width="${Math.max(1.5, r * 0.16).toFixed(1)}" />
    <polygon points="${star}" fill="#FFFFFF" />
  </g>`
}

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
  const special = new Set(params.specialPositions ?? [])
  const specialIcon = params.specialStampImageDataUri ?? null

  const stampElements = Array.from({ length: maxVisits }, (_, i) => {
    const row = fillOrder === "interleaved" ? i % rows : Math.floor(i / cols)
    const col = fillOrder === "interleaved" ? Math.floor(i / rows) : i % cols
    const rowOff = rowOffsets[row] ?? { x: 0, y: 0 }
    const x = offsetX + col * gapX + rowOff.x
    const y = offsetY + row * gapY + rowOff.y
    const filled = params.completed === true || i < stampsInCycle
    const opacity = filled ? filledOpacity : emptyOpacity
    const isSpecial = special.has(i + 1)

    if (isSpecial && specialIcon) {
      return `  <image href="${specialIcon}" x="${x}" y="${y}" width="${stampSize}" height="${stampSize}" opacity="${opacity}" />`
    }
    const stamp = `  <image href="${stampImageDataUri}" x="${x}" y="${y}" width="${stampSize}" height="${stampSize}" opacity="${opacity}" />`
    return isSpecial ? `${stamp}\n${giftBadge(x, y, stampSize, filled)}` : stamp
  }).join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${STRIP_WIDTH_2X}" height="${STRIP_HEIGHT_2X}" viewBox="0 0 ${STRIP_WIDTH_2X} ${STRIP_HEIGHT_2X}">
  <image href="${backgroundImageDataUri}" x="0" y="0" width="${STRIP_WIDTH_2X}" height="${STRIP_HEIGHT_2X}" preserveAspectRatio="xMidYMid slice" />
${stampElements}
</svg>`
}

/**
 * Generate Apple Wallet strip images at @2x (750x288) and @1x (375x144).
 *
 * Store cards render the strip at 375×144 pt. Until Oct 2026 we shipped 750×246
 * (an older guide): iOS scaled it up 17 % and cropped 64 px per side.
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
