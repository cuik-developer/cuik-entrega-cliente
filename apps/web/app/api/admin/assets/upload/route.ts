import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { generateAssetKey, uploadAsset } from "@/lib/storage"

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const uploadSchema = z.object({
  tenantId: z.string().uuid("tenantId must be a valid UUID"),
  assetType: z.enum(["logo", "strip", "stamp", "background"]).optional(),
})

export async function POST(request: Request) {
  // Auth
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse("Invalid form data", 400)
  }

  const file = formData.get("file")
  const tenantId = formData.get("tenantId")

  if (!(file instanceof File)) {
    return errorResponse("Missing or invalid file", 400)
  }

  // Validate metadata
  const parsed = uploadSchema.safeParse({
    tenantId,
    assetType: formData.get("assetType") ?? undefined,
  })

  if (!parsed.success) {
    return errorResponse("Validation failed", 400, parsed.error.flatten().fieldErrors)
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return errorResponse(
      `Unsupported content type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`,
      400,
    )
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return errorResponse(`File too large (max ${MAX_SIZE / 1024 / 1024}MB)`, 400)
  }

  // Upload to MinIO
  try {
    const ext = file.name.split(".").pop() || file.type.split("/")[1] || "png"
    const key = generateAssetKey(parsed.data.tenantId, ext)
    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadAsset(key, buffer, file.type)

    return successResponse({
      url,
      key,
      size: file.size,
      contentType: file.type,
    })
  } catch (error) {
    console.error("[POST /api/admin/assets/upload]", error)
    return errorResponse("Failed to upload asset", 500)
  }
}
