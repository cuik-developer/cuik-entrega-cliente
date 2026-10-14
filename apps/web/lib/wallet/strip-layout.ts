import type { StripGridLayout } from "./points-strip"

/** `pass_designs.stamps_config` as the wallet routes read it (every field optional but maxVisits). */
export type StampsConfigLike = {
  maxVisits: number
  gridCols?: number
  gridRows?: number
  stampSize?: number
  offsetX?: number
  offsetY?: number
  gapX?: number
  gapY?: number
  filledOpacity?: number
  emptyOpacity?: number
  fillOrder?: "row" | "interleaved"
  rowOffsets?: Array<{ x: number; y: number }>
  specialPositions?: number[]
  specialStampUrl?: string | null
  specialStampScale?: number
}

/**
 * Grid layout for the strip from the stored stamps config, with the same
 * defaults the editor uses. One place for the three Apple routes and the
 * Google strip endpoint, so a new design field reaches every pass at once.
 */
export function stripLayoutFrom(
  cfg: StampsConfigLike | null | undefined,
): StripGridLayout | undefined {
  if (!cfg) return undefined
  return {
    cols: cfg.gridCols ?? 4,
    rows: cfg.gridRows ?? 2,
    stampSize: cfg.stampSize ?? 63,
    offsetX: cfg.offsetX ?? 197,
    offsetY: cfg.offsetY ?? 23,
    gapX: cfg.gapX ?? 98,
    gapY: cfg.gapY ?? 73,
    filledOpacity: cfg.filledOpacity ?? 1,
    emptyOpacity: cfg.emptyOpacity ?? 0.35,
    fillOrder: cfg.fillOrder ?? "row",
    rowOffsets: cfg.rowOffsets,
    specialPositions: Array.isArray(cfg.specialPositions)
      ? cfg.specialPositions.filter((n) => Number.isInteger(n) && n >= 1)
      : [],
    specialStampScale:
      typeof cfg.specialStampScale === "number" && Number.isFinite(cfg.specialStampScale)
        ? Math.min(200, Math.max(50, cfg.specialStampScale))
        : 100,
  }
}

/**
 * Visits per card for the strip: the active promotion's value (what visits
 * are counted against), else the design's, else 8.
 */
export function stripMaxVisits(
  promotion: { maxVisits: number | null } | undefined,
  cfg: StampsConfigLike | null | undefined,
): number {
  return promotion?.maxVisits || cfg?.maxVisits || 8
}

/**
 * The card was just completed and the reward is still waiting at the counter:
 * the strip shows every stamp filled instead of an empty new card. Needs real
 * visits: a client with none and a stray pending reward keeps an empty card.
 */
export function stripCompleted(
  stampsInCycle: number,
  pendingRewards: number,
  totalVisits: number,
): boolean {
  return totalVisits > 0 && stampsInCycle === 0 && pendingRewards > 0
}

/**
 * Only our own uploaded assets may be fetched for the strip: a relative
 * `/api/assets/<key>` with no traversal, no query, no protocol. Anything else
 * (an external host, a data URI, `..`) is ignored and the badge is drawn.
 */
export function safeAssetUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  if (!u.startsWith("/api/assets/") || u.length > 512) return null
  if (u.includes("..") || u.includes("//") || u.includes("?") || u.includes("#")) return null
  if (/[\s\\<>"']/.test(u)) return null
  return u
}
