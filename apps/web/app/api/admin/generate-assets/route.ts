import { z } from "zod"
import { generateImage } from "@/lib/ai/generate-image"
import { ASSET_DIMENSIONS, type AssetType, buildPrompt } from "@/lib/ai/prompt-templates"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { generateAssetKey, uploadAsset } from "@/lib/storage"

// ─── Validation ─────────────────────────────────────────────────────

const generateSchema = z.object({
  tenantId: z.string().uuid("tenantId must be a valid UUID"),
  assetType: z.enum(["strip", "logo", "stamp", "icon"]),
  prompt: z.string().max(1000).optional(),
  businessName: z.string().min(1).max(200),
  businessType: z.string().max(100).optional(),
  primaryColor: z.string().max(50).optional(),
  promotionType: z.enum(["stamps", "points"]).optional(),
})

// ─── POST Handler ───────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Auth
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    // Parse body
    const body = await request.json()
    const parsed = generateSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten().fieldErrors)
    }

    const {
      tenantId,
      assetType,
      prompt: customPrompt,
      businessName,
      businessType,
      primaryColor,
      promotionType,
    } = parsed.data

    // Build prompt (custom or from template)
    const prompt =
      customPrompt ||
      buildPrompt(assetType as AssetType, {
        businessName,
        businessType,
        primaryColor,
        promotionType,
      })

    // Get dimensions
    const dimensions = ASSET_DIMENSIONS[assetType as AssetType]
    const isTransparent = assetType === "logo" || assetType === "stamp" || assetType === "icon"

    // Generate image
    const buffer = await generateImage(prompt, {
      width: dimensions.width,
      height: dimensions.height,
      transparent: isTransparent,
    })

    // Upload to MinIO
    const key = generateAssetKey(tenantId, "png")
    const url = await uploadAsset(key, buffer, "image/png")

    return successResponse({
      url,
      key,
      assetType,
      prompt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[POST /api/admin/generate-assets]", error)

    // Return specific error codes based on error type
    if (message.includes("timed out")) {
      return errorResponse(message, 408)
    }
    if (message.includes("filtered") || message.includes("safety")) {
      return errorResponse(message, 422)
    }
    if (message.includes("not installed") || message.includes("not found in PATH")) {
      return errorResponse(message, 503)
    }

    return errorResponse(`Asset generation failed: ${message}`, 500)
  }
}
