import { z } from "zod"

import { errorResponse, requireAuth, requireSuperAdminOr, successResponse } from "@/lib/api-utils"
import { generateAssetKey, uploadAsset } from "@/lib/storage"

// PNG and JPEG only. SVG can carry script and is served from our own origin,
// so it is not accepted (security review 19 Oct 2026). The type is taken from
// the file's first bytes, never from the client-declared MIME or name.
const ALLOWED_TYPES = ["image/png", "image/jpeg"] as const
type AllowedType = (typeof ALLOWED_TYPES)[number]
const EXT: Record<AllowedType, string> = { "image/png": "png", "image/jpeg": "jpg" }

function sniffImageType(buf: Buffer): AllowedType | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png"
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  return null
}
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const uploadSchema = z.object({
  tenantId: z.string().uuid("tenantId must be a valid UUID"),
  assetType: z.enum(["logo", "icon", "strip", "stamp", "background"]).optional(),
})

export async function POST(request: Request) {
  // Auth
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = await requireSuperAdminOr(session, ["designs", "branding"])
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

  // Validate file size
  if (file.size > MAX_SIZE) {
    return errorResponse(`File too large (max ${MAX_SIZE / 1024 / 1024}MB)`, 400)
  }

  // Upload to MinIO
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType = sniffImageType(buffer)
    if (!contentType) {
      return errorResponse(`Unsupported file. Allowed: ${ALLOWED_TYPES.join(", ")}`, 400)
    }
    const key = generateAssetKey(parsed.data.tenantId, EXT[contentType])
    const url = await uploadAsset(key, buffer, contentType)

    return successResponse({
      url,
      key,
      size: file.size,
      contentType,
    })
  } catch (error) {
    console.error("[POST /api/admin/assets/upload]", error)
    return errorResponse("Failed to upload asset", 500)
  }
}
