import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { generateAssetKey, uploadAsset } from "@/lib/storage"

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
}
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * POST /api/[tenant]/assets/upload  (multipart: file)
 * Tenant-admin upload for reward photos. Same storage as the super-admin
 * asset upload (MinIO or local fallback); returns the relative asset URL.
 * PNG/JPEG only: the asset server maps those content types reliably.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const file = formData.get("file")
    if (!(file instanceof File)) return errorResponse("Missing or invalid file", 400)

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) return errorResponse("Formato no soportado. Usá PNG o JPG.", 400)
    if (file.size > MAX_SIZE) return errorResponse("La imagen supera 5 MB", 400)

    const key = generateAssetKey(tenant.id, ext)
    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadAsset(key, buffer, file.type)

    return successResponse({ url, key, size: file.size })
  } catch (error) {
    console.error("[POST /api/[tenant]/assets/upload]", error)
    return errorResponse("Internal server error", 500)
  }
}
