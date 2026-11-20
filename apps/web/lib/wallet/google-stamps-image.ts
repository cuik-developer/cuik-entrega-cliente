import { createHash } from "node:crypto"

import {
  type StampsConfigLike,
  safeAssetUrl,
  stripCompleted,
  stripLayoutFrom,
} from "./strip-layout"

/**
 * Stamp card image for Google Wallet (tenants.features.googleStampsImage).
 *
 * Apple carries the strip inside the pass file, drawn for each client. Google
 * only takes a link and downloads the picture itself, so the same drawing is
 * exposed as a public PNG per STATE of a design ("3 of 6", "full"), with no
 * client data in the address:
 *
 *   /api/public/google-stamps/<designId>/<hash>-<state>.png
 *
 * `hash` covers everything the picture is drawn from. Google caches images by
 * URL, so the address must change exactly when the picture would: a new
 * background, stamp, grid or number of visits gives a new hash, and each visit
 * gives a new state.
 *
 * This file is pure (no DB) so the route, the callers and the tests share it.
 */

/** Bump to make every pass fetch its image again after a change in the drawing itself. */
const RENDER_VERSION = 1

/** What the picture of a design is drawn from: exactly the inputs of the Apple strip. */
export type StampsImageSource = {
  designId: string
  stripBgUrl: string
  stampUrl: string
  stampsConfig: StampsConfigLike | null
  /** Visits per card, by the same rule as Apple (`stripMaxVisits`). */
  maxVisits: number
}

/** Filled stamps (0 .. maxVisits-1), or the completed card with its reward pending. */
export type StampsImageState = number | "full"

export function stampsImageHash(src: StampsImageSource): string {
  const drawnFrom = [
    RENDER_VERSION,
    src.stripBgUrl,
    src.stampUrl,
    safeAssetUrl(src.stampsConfig?.specialStampUrl),
    src.maxVisits,
    stripLayoutFrom(src.stampsConfig) ?? null,
  ]
  return createHash("sha256").update(JSON.stringify(drawnFrom)).digest("hex").slice(0, 12)
}

/** Same rule as the Apple strip: a completed card with its reward pending is drawn full. */
export function stampsImageState(
  maxVisits: number,
  c: { stampsInCycle: number; pendingRewards: number; totalVisits: number },
): StampsImageState {
  if (stripCompleted(c.stampsInCycle, c.pendingRewards, c.totalVisits)) return "full"
  return Math.min(Math.max(0, Math.trunc(c.stampsInCycle)), Math.max(0, maxVisits - 1))
}

export function stampsImagePath(designId: string, hash: string, state: StampsImageState): string {
  return `/api/public/google-stamps/${designId}/${hash}-${state}.png`
}

const FILE = /^([0-9a-f]{12})-(full|\d{1,3})\.png$/

/** Reads `<hash>-<state>.png`; anything else is not ours. */
export function parseStampsImageFile(
  file: string,
): { hash: string; state: StampsImageState } | null {
  const m = FILE.exec(file)
  if (!m?.[1] || !m[2]) return null
  return { hash: m[1], state: m[2] === "full" ? "full" : Number(m[2]) }
}
