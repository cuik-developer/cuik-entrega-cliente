import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"

/**
 * Stamp grid geometry in the designer's terms.
 *
 * Everything is measured in px on the Apple strip (750×288 = @2x of the
 * 375×144 pt store-card strip). The STORED format is what the server reads
 * (packages/wallet strip-image.ts, apps/web lib/wallet/strip-layout.ts):
 *   offsetX / offsetY = top-left corner of the first stamp
 *   gapX / gapY       = PITCH: left edge to the next left edge (top to next top)
 * The UI shows the empty space between stamps instead ("separación"), so
 *   separación = pitch − tamaño   and   pitch = separación + tamaño.
 * Only the UI converts; the stored shape never changes.
 */

export const STRIP_W = 750
export const STRIP_H = 288
export const SIZE_MIN = 16
export const SIZE_MAX = 200
export const GRID_MAX = 10

/** Fallbacks the server applies when a stored key is missing (strip-layout.ts). */
export const SERVER_FALLBACKS = {
  stampSize: 63,
  offsetX: 197,
  offsetY: 23,
  gapX: 98,
  gapY: 73,
  gridCols: 4,
  gridRows: 2,
} as const

type StampsConfig = PassDesignConfigV2["stampsConfig"]

export interface StampUiValues {
  /** Tamaño del sello (px). */
  size: number
  /** Margen izquierdo: strip left edge → first stamp (px). */
  marginLeft: number
  /** Margen superior: strip top → first row (px). */
  marginTop: number
  /** Separación horizontal: empty space between two stamps (px). */
  sepX: number
  /** Separación vertical: empty space between two rows (px). */
  sepY: number
}

/** Two decimals at most, without float noise (38.8 stays 38.8). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Stored config → designer values. Missing keys use the server fallbacks. */
export function toUiValues(cfg: Partial<StampsConfig>): StampUiValues {
  const size = cfg.stampSize ?? SERVER_FALLBACKS.stampSize
  return {
    size,
    marginLeft: cfg.offsetX ?? SERVER_FALLBACKS.offsetX,
    marginTop: cfg.offsetY ?? SERVER_FALLBACKS.offsetY,
    sepX: round2((cfg.gapX ?? SERVER_FALLBACKS.gapX) - size),
    sepY: round2((cfg.gapY ?? SERVER_FALLBACKS.gapY) - size),
  }
}

/** Slider/input ranges for the designer values, given the current size. */
export function uiRanges(size: number) {
  return {
    size: { min: SIZE_MIN, max: SIZE_MAX },
    marginLeft: { min: 0, max: Math.max(0, STRIP_W - size) },
    marginTop: { min: 0, max: Math.max(0, STRIP_H - size) },
    // The pitch is stored capped at the strip (750 / 288), so the separation
    // never needs to be larger than the strip minus one stamp.
    sepX: { min: 0, max: Math.max(0, STRIP_W - size) },
    sepY: { min: 0, max: Math.max(0, STRIP_H - size) },
  }
}

/**
 * The stored patch for one designer edit. Changing the size keeps both
 * separations constant (the pitch is recomputed); margins are untouched.
 */
export function patchFromUi(
  cfg: Partial<StampsConfig>,
  key: keyof StampUiValues,
  raw: number,
): Partial<StampsConfig> {
  if (!Number.isFinite(raw)) return {}
  const ui = toUiValues(cfg)
  const r = uiRanges(ui.size)
  switch (key) {
    case "size": {
      const size = round2(clamp(raw, r.size.min, r.size.max))
      const next = uiRanges(size)
      return {
        stampSize: size,
        gapX: round2(clamp(ui.sepX, next.sepX.min, next.sepX.max) + size),
        gapY: round2(clamp(ui.sepY, next.sepY.min, next.sepY.max) + size),
      }
    }
    case "marginLeft":
      return { offsetX: round2(clamp(raw, r.marginLeft.min, r.marginLeft.max)) }
    case "marginTop":
      return { offsetY: round2(clamp(raw, r.marginTop.min, r.marginTop.max)) }
    case "sepX":
      return { gapX: round2(clamp(raw, r.sepX.min, r.sepX.max) + ui.size) }
    case "sepY":
      return { gapY: round2(clamp(raw, r.sepY.min, r.sepY.max) + ui.size) }
  }
}

/** Same row/column the server picks for stamp `i` (0-based). */
export function cellOf(
  i: number,
  cols: number,
  rows: number,
  fillOrder: "row" | "interleaved" = "row",
): { row: number; col: number } {
  const c = Math.max(1, cols)
  const r = Math.max(1, rows)
  return fillOrder === "interleaved"
    ? { row: i % r, col: Math.floor(i / r) }
    : { row: Math.floor(i / c), col: i % c }
}

/** Top-left of stamp `i` in strip px, exactly as strip-image.ts computes it. */
export function stampOrigin(cfg: Partial<StampsConfig>, i: number): { x: number; y: number } {
  const cols = cfg.gridCols ?? SERVER_FALLBACKS.gridCols
  const rows = cfg.gridRows ?? SERVER_FALLBACKS.gridRows
  const { row, col } = cellOf(i, cols, rows, cfg.fillOrder ?? "row")
  const off = cfg.rowOffsets?.[row] ?? { x: 0, y: 0 }
  return {
    x:
      (cfg.offsetX ?? SERVER_FALLBACKS.offsetX) + col * (cfg.gapX ?? SERVER_FALLBACKS.gapX) + off.x,
    y:
      (cfg.offsetY ?? SERVER_FALLBACKS.offsetY) + row * (cfg.gapY ?? SERVER_FALLBACKS.gapY) + off.y,
  }
}

/** Bounding box of the `count` stamps the server draws, and whether it leaves the strip. */
export function gridBounds(cfg: Partial<StampsConfig>, count: number) {
  const size = cfg.stampSize ?? SERVER_FALLBACKS.stampSize
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let i = 0; i < count; i++) {
    const { x, y } = stampOrigin(cfg, i)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + size)
    maxY = Math.max(maxY, y + size)
  }
  if (count <= 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, overflows: false }
  const eps = 0.01
  return {
    minX: round2(minX),
    minY: round2(minY),
    maxX: round2(maxX),
    maxY: round2(maxY),
    overflows: minX < -eps || minY < -eps || maxX > STRIP_W + eps || maxY > STRIP_H + eps,
  }
}

/** Visits per card the server uses: the promotion's, else the design's, else 8 (strip-layout.ts). */
export function effectiveMaxVisits(
  promotionMaxVisits: number | null | undefined,
  designMaxVisits: number | null | undefined,
): number {
  return promotionMaxVisits || designMaxVisits || 8
}
