import { and, db, desc, eq, passAssets, passDesigns, promotions, tenants } from "@cuik/db"
import { parseTenantFeatures } from "@cuik/shared/validators"

import {
  type StampsImageSource,
  stampsImageHash,
  stampsImagePath,
  stampsImageState,
} from "./google-stamps-image"
import { type StampsConfigLike, stripMaxVisits } from "./strip-layout"

/** Client numbers the Google pass is being sent with. */
export type StampsImageClient = {
  stampsInCycle: number
  /** Visits per card the pass TEXT is using ("N de M visitas"). */
  maxVisits: number
  pendingRewards: number
  totalVisits: number
}

type DesignRow = {
  id: string
  tenantId: string
  type: string
  promotionId: string | null
  isActive: boolean
  stampsConfig: unknown
}

const DESIGN_COLUMNS = {
  id: passDesigns.id,
  tenantId: passDesigns.tenantId,
  type: passDesigns.type,
  promotionId: passDesigns.promotionId,
  isActive: passDesigns.isActive,
  stampsConfig: passDesigns.stampsConfig,
}

async function activePromotionOf(tenantId: string) {
  const [promo] = await db
    .select({ id: promotions.id, type: promotions.type, maxVisits: promotions.maxVisits })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .limit(1)
  return promo
}

/** Background and stamp of a design; without both there is nothing to draw. */
async function sourceOf(
  design: DesignRow,
  promo: { type: string; maxVisits: number | null } | undefined,
): Promise<StampsImageSource | null> {
  // Only stamp cards have a picture that changes; points keep the fixed banner.
  if (promo?.type !== "stamps") return null
  const assets = await db
    .select({ type: passAssets.type, url: passAssets.url })
    .from(passAssets)
    .where(eq(passAssets.designId, design.id))
  const stripBgUrl = assets.find((a) => a.type === "strip_bg")?.url
  const stampUrl = assets.find((a) => a.type === "stamp")?.url
  if (!stripBgUrl || !stampUrl) return null
  const stampsConfig = design.stampsConfig as StampsConfigLike | null
  return {
    designId: design.id,
    stripBgUrl,
    stampUrl,
    stampsConfig,
    maxVisits: stripMaxVisits(promo, stampsConfig),
  }
}

/**
 * The source the public image route draws for a design id. Not tied to the
 * tenant switch on purpose: turning the switch off must not break the image of
 * a pass whose re-send to Google failed. It only composes images that are
 * already public (`/api/assets`).
 */
export async function stampsImageSourceOfDesign(
  designId: string,
): Promise<StampsImageSource | null> {
  const [design] = await db
    .select(DESIGN_COLUMNS)
    .from(passDesigns)
    .where(eq(passDesigns.id, designId))
    .limit(1)
  if (!design || design.type !== "apple_store") return null
  return sourceOf(design, await activePromotionOf(design.tenantId))
}

/**
 * Image link builder for a tenant's Google passes, or null when the tenant
 * keeps the fixed banner: switch off (the default), not a stamps program, no
 * published Apple design, or a design without background or stamp.
 *
 * The picture is the tenant's published Apple strip: same design choice as the
 * Apple pass route (published, linked to the active promotion first).
 *
 * The returned function gives the link for one client, or undefined when the
 * pass text counts against a different number of visits than the picture would
 * draw: better the fixed banner than a card that contradicts its own text.
 *
 * Never throws: any error means "fixed banner", so a pass update is never lost
 * because of the image.
 */
export async function tenantStampsImage(
  tenantId: string,
): Promise<((client: StampsImageClient) => string | undefined) | null> {
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")
    if (!baseUrl) return null

    const [tenant] = await db
      .select({ features: tenants.features })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!parseTenantFeatures(tenant?.features).googleStampsImage) return null

    const promo = await activePromotionOf(tenantId)
    const candidates = await db
      .select(DESIGN_COLUMNS)
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, tenantId), eq(passDesigns.type, "apple_store")))
      .orderBy(desc(passDesigns.updatedAt))
    const design =
      candidates.find((d) => d.isActive && promo != null && d.promotionId === promo.id) ??
      candidates.find((d) => d.isActive)
    if (!design) return null

    const source = await sourceOf(design, promo)
    if (!source) return null
    const hash = stampsImageHash(source)

    return (client) => {
      if (client.maxVisits !== source.maxVisits) return undefined
      const state = stampsImageState(source.maxVisits, client)
      return `${baseUrl}${stampsImagePath(source.designId, hash, state)}`
    }
  } catch (err) {
    console.error("[Wallet:GoogleStampsImage] Falling back to the fixed banner:", err)
    return null
  }
}

/** One client: the link for their Google pass, or undefined for the fixed banner. */
export async function googleStampsImageUrl(
  tenantId: string,
  client: StampsImageClient,
): Promise<string | undefined> {
  const forClient = await tenantStampsImage(tenantId)
  return forClient?.(client)
}
