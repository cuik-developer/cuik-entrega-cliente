import { and, db, eq, promotions } from "@cuik/db"
import { z } from "zod"
import { generateImage } from "@/lib/ai/generate-image"
import { ASSET_DIMENSIONS, buildPrompt } from "@/lib/ai/prompt-templates"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { generateAssetKey, uploadAsset } from "@/lib/storage"

// ─── Validation ─────────────────────────────────────────────────────

const generateFullSchema = z.object({
  tenantId: z.string().uuid(),
  businessName: z.string().min(1).max(200),
  businessType: z.string().max(100).optional(),
  promotionType: z.enum(["stamps", "points"]).optional(),
})

// ─── Color Palette Generation ───────────────────────────────────────

interface DesignPalette {
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  primaryColor: string
}

/**
 * Generate a harmonious color palette based on business type.
 * Uses predefined palettes mapped to business categories.
 */
function generatePalette(businessType?: string): DesignPalette {
  const type = (businessType ?? "").toLowerCase()

  const palettes: Record<string, DesignPalette> = {
    café: {
      backgroundColor: "#2C1810",
      foregroundColor: "#FFFFFF",
      labelColor: "#D4A574",
      primaryColor: "warm brown and cream",
    },
    cafetería: {
      backgroundColor: "#2C1810",
      foregroundColor: "#FFFFFF",
      labelColor: "#D4A574",
      primaryColor: "warm brown and cream",
    },
    coffee: {
      backgroundColor: "#2C1810",
      foregroundColor: "#FFFFFF",
      labelColor: "#D4A574",
      primaryColor: "warm brown and cream",
    },
    barbería: {
      backgroundColor: "#1A1A2E",
      foregroundColor: "#FFFFFF",
      labelColor: "#E0C097",
      primaryColor: "navy blue and gold",
    },
    restaurante: {
      backgroundColor: "#1B2838",
      foregroundColor: "#FFFFFF",
      labelColor: "#FF6B35",
      primaryColor: "dark blue and orange",
    },
    "pet shop": {
      backgroundColor: "#F4845F",
      foregroundColor: "#FFFFFF",
      labelColor: "#FFF0DB",
      primaryColor: "warm orange and cream",
    },
    mascota: {
      backgroundColor: "#F4845F",
      foregroundColor: "#FFFFFF",
      labelColor: "#FFF0DB",
      primaryColor: "warm orange and cream",
    },
    panadería: {
      backgroundColor: "#F5E6CC",
      foregroundColor: "#3D2B1F",
      labelColor: "#8B6914",
      primaryColor: "warm beige and brown",
    },
    gym: {
      backgroundColor: "#0D0D0D",
      foregroundColor: "#FFFFFF",
      labelColor: "#00FF87",
      primaryColor: "black and neon green",
    },
    fitness: {
      backgroundColor: "#0D0D0D",
      foregroundColor: "#FFFFFF",
      labelColor: "#00FF87",
      primaryColor: "black and neon green",
    },
    spa: {
      backgroundColor: "#2D5016",
      foregroundColor: "#FFFFFF",
      labelColor: "#C8E6C9",
      primaryColor: "deep green and light sage",
    },
    belleza: {
      backgroundColor: "#4A1942",
      foregroundColor: "#FFFFFF",
      labelColor: "#F8BBD9",
      primaryColor: "deep purple and pink",
    },
    tecnología: {
      backgroundColor: "#0A1628",
      foregroundColor: "#FFFFFF",
      labelColor: "#64B5F6",
      primaryColor: "dark navy and electric blue",
    },
  }

  // Find matching palette
  for (const [key, palette] of Object.entries(palettes)) {
    if (type.includes(key)) return palette
  }

  // Default: Cuik blue
  return {
    backgroundColor: "#0E70DB",
    foregroundColor: "#FFFFFF",
    labelColor: "#B3D4FC",
    primaryColor: "vibrant blue",
  }
}

// ─── Config Builder ─────────────────────────────────────────────────

function computeGridLayout(maxVisits: number) {
  const gridCols = maxVisits <= 5 ? maxVisits : maxVisits <= 10 ? Math.ceil(maxVisits / 2) : 4
  const gridRows = maxVisits <= 5 ? 1 : maxVisits <= 10 ? 2 : Math.ceil(maxVisits / 4)
  return { gridCols, gridRows }
}

function buildPointsFields(ctx: {
  pointsPerCurrency: unknown
  promoReward: string | null
  businessName: string
}) {
  return {
    headerFields: [{ key: "points", label: "PUNTOS", value: "{{points.balance}}" }],
    secondaryFields: [
      { key: "client", label: "CLIENTE", value: "{{client.name}}" },
      { key: "tier", label: "NIVEL", value: "{{client.tier}}" },
    ],
    backFields: [
      { key: "balance", label: "Balance de puntos", value: "{{points.balance}}" },
      {
        key: "rate",
        label: "Puntos por compra",
        value: `${ctx.pointsPerCurrency} punto(s) por cada S/ 1.00`,
      },
      { key: "visits", label: "Visitas totales", value: "{{stamps.total}}" },
      ...(ctx.promoReward ? [{ key: "program", label: "Programa", value: ctx.promoReward }] : []),
      {
        key: "info",
        label: "Como funciona",
        value: `Acumula puntos con cada compra en ${ctx.businessName}. Canjea tus puntos por premios del catalogo.`,
      },
    ],
  }
}

function buildStampsFields(ctx: {
  promoMaxVisits: number
  promoReward: string | null
  businessName: string
}) {
  return {
    headerFields: [{ key: "total", label: "# DE VISITAS", value: "{{stamps.total}}" }],
    secondaryFields: [
      { key: "client", label: "NOMBRE", value: "{{client.name}}" },
      { key: "stamps", label: "Visitas en ciclo", value: "{{stamps.current}}" },
    ],
    backFields: [
      {
        key: "stamps_b",
        label: "Visitas en ciclo",
        value: "{{stamps.current}} de {{stamps.max}}",
      },
      { key: "total_b", label: "Visitas totales", value: "{{stamps.total}}" },
      { key: "rewards_b", label: "Premios pendientes", value: "{{rewards.pending}}" },
      ...(ctx.promoReward ? [{ key: "reward", label: "Premio", value: ctx.promoReward }] : []),
      {
        key: "info",
        label: "Como funciona",
        value: `Completa {{stamps.max}} visitas en ${ctx.businessName} y gana tu premio.`,
      },
    ],
  }
}

function buildV2Config(ctx: {
  assets: Record<string, string | null>
  palette: DesignPalette
  promoType: string
  promoMaxVisits: number
  promoReward: string | null
  pointsPerCurrency: unknown
  businessName: string
}) {
  const isPoints = ctx.promoType === "points"
  const { gridCols, gridRows } = computeGridLayout(ctx.promoMaxVisits)

  return {
    version: 2 as const,
    assets: ctx.assets,
    colors: {
      backgroundColor: ctx.palette.backgroundColor,
      foregroundColor: ctx.palette.foregroundColor,
      labelColor: ctx.palette.labelColor,
    },
    stampsConfig: isPoints
      ? { maxVisits: 0, gridCols: 0, gridRows: 0, stampSize: 0, filledOpacity: 0, emptyOpacity: 0 }
      : {
          maxVisits: ctx.promoMaxVisits,
          gridCols,
          gridRows,
          stampSize: 63,
          filledOpacity: 1,
          emptyOpacity: 0.35,
        },
    fields: isPoints ? buildPointsFields(ctx) : buildStampsFields(ctx),
    logoText: ctx.businessName,
  }
}

// ─── POST Handler ───────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const body = await request.json()
    const parsed = generateFullSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten().fieldErrors)
    }

    const { tenantId, businessName, businessType, promotionType } = parsed.data

    // Fetch active promotion data for this tenant
    const [activePromo] = await db
      .select()
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
      .limit(1)

    const promoType = promotionType ?? activePromo?.type ?? "stamps"
    const promoReward = activePromo?.rewardValue ?? null
    const promoMaxVisits = activePromo?.maxVisits ?? 8
    const promoConfig = activePromo?.config as Record<string, unknown> | null
    const pointsPerCurrency =
      (promoConfig?.points as Record<string, unknown>)?.pointsPerCurrency ?? 1

    // Generate color palette based on business type
    const palette = generatePalette(businessType)

    // Generate all 4 assets in parallel
    const assetTypes = ["strip", "logo", "stamp"] as const

    const generateAndUpload = async (assetType: "strip" | "logo" | "stamp") => {
      const dimensions = ASSET_DIMENSIONS[assetType]
      const isTransparent = assetType === "logo" || assetType === "stamp"

      const prompt = buildPrompt(assetType, {
        businessName,
        businessType,
        primaryColor: palette.primaryColor,
        promotionType,
      })

      const buffer = await generateImage(prompt, {
        width: dimensions.width,
        height: dimensions.height,
        transparent: isTransparent,
      })

      const key = generateAssetKey(tenantId, "png")
      const url = await uploadAsset(key, buffer, "image/png")

      return { assetType, url, key }
    }

    // Generate strip, logo, stamp in parallel
    const results = await Promise.allSettled(assetTypes.map((type) => generateAndUpload(type)))

    // Build assets map from results
    const assets: Record<string, string | null> = {
      stripBg: null,
      logo: null,
      stamp: null,
      icon: null, // icon reuses logo
    }

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { assetType, url } = result.value
        if (assetType === "strip") assets.stripBg = url
        else if (assetType === "logo") {
          assets.logo = url
          assets.icon = url // reuse logo as icon
        } else if (assetType === "stamp") assets.stamp = url
      } else {
        console.error("[generate-full-design] Asset generation failed:", result.reason)
      }
    }

    // Build the full v2 config
    const config = buildV2Config({
      assets,
      palette,
      promoType,
      promoMaxVisits,
      promoReward,
      pointsPerCurrency,
      businessName,
    })

    return successResponse({ config })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[POST /api/admin/generate-full-design]", error)

    if (message.includes("timed out")) {
      return errorResponse(message, 408)
    }

    return errorResponse(`Full design generation failed: ${message}`, 500)
  }
}
