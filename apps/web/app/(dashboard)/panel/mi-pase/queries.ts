import { and, db, eq, passAssets, passDesigns, promotions, rewardCatalog } from "@cuik/db"
import { adaptV1ToV2, isV2Config } from "@cuik/editor"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import { pointsPromotionConfigSchema, stampsPromotionConfigSchema } from "@cuik/shared/validators"

export async function getActiveDesignForTenant(tenantId: string) {
  // 1. Find the active promotion for this tenant
  const [activePromo] = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .limit(1)

  let design: typeof passDesigns.$inferSelect | null = null

  // 2. If there's an active promotion, find its linked pass design
  if (activePromo) {
    const [linked] = await db
      .select()
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, tenantId), eq(passDesigns.promotionId, activePromo.id)))
      .limit(1)
    design = linked ?? null
  }

  // 3. Fallback: find any published pass design for this tenant
  if (!design) {
    const [published] = await db
      .select()
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, tenantId), eq(passDesigns.isActive, true)))
      .limit(1)
    design = published ?? null
  }

  if (!design) return null

  const assets = await db.select().from(passAssets).where(eq(passAssets.designId, design.id))

  // Build promotion info with parsed config
  let promotion: {
    type: string
    rewardValue: string | null
    maxVisits: number | null
    config: Record<string, unknown> | null
  } | null = null

  if (activePromo) {
    const parsedConfig =
      activePromo.type === "points"
        ? pointsPromotionConfigSchema.parse(activePromo.config ?? {})
        : stampsPromotionConfigSchema.parse(activePromo.config ?? {})

    promotion = {
      type: activePromo.type,
      rewardValue: activePromo.rewardValue,
      maxVisits: activePromo.maxVisits,
      config: parsedConfig as unknown as Record<string, unknown>,
    }
  }

  // Fetch catalog items (for points promotions)
  let catalogItems: Array<{
    id: string
    name: string
    description: string | null
    pointsCost: number
    category: string | null
  }> = []
  if (activePromo?.type === "points") {
    catalogItems = await db
      .select({
        id: rewardCatalog.id,
        name: rewardCatalog.name,
        description: rewardCatalog.description,
        pointsCost: rewardCatalog.pointsCost,
        category: rewardCatalog.category,
      })
      .from(rewardCatalog)
      .where(and(eq(rewardCatalog.tenantId, tenantId), eq(rewardCatalog.active, true)))
      .orderBy(rewardCatalog.sortOrder)
  }

  return { design, assets, promotion, catalogItems }
}

type ActiveDesignResult = NonNullable<Awaited<ReturnType<typeof getActiveDesignForTenant>>>

export function assemblePassConfig(
  design: ActiveDesignResult["design"],
  assets: ActiveDesignResult["assets"],
): PassDesignConfigV2 {
  // Build asset URL map from pass_assets rows (source of truth)
  const assetMap: Record<string, string> = {}
  for (const a of assets) {
    assetMap[a.type] = a.url
  }

  // Determine base config from canvasData version
  let config: PassDesignConfigV2

  if (isV2Config(design.canvasData)) {
    config = structuredClone(design.canvasData)
  } else {
    config = adaptV1ToV2(design.canvasData, design.colors, design.stampsConfig)
  }

  // Override assets with persisted URLs from pass_assets table
  config.assets = {
    logo: assetMap.logo ?? null,
    stripBg: assetMap.strip_bg ?? null,
    stamp: assetMap.stamp ?? null,
    icon: assetMap.icon ?? null,
  }

  // Merge stampsConfig defaults for missing values
  config.stampsConfig = {
    ...config.stampsConfig,
    stampSize: config.stampsConfig.stampSize ?? 63,
    filledOpacity: config.stampsConfig.filledOpacity ?? 1,
    emptyOpacity: config.stampsConfig.emptyOpacity ?? 0.35,
  }

  // Set logoText from design name if empty
  if (!config.logoText) {
    config.logoText = design.name
  }

  return config
}
