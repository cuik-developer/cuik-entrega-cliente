import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { MAX_FILE_BYTES } from "@/lib/loyalty/impact/parse"
import { createImport, listImports } from "@/lib/loyalty/impact/store"

/** A super-admin viewing the tenant read-only never writes on its behalf. */
function readOnlyView(session: { user: { role?: string }; saViewTenantId?: string | null }) {
  return session.user.role === "super_admin" && !!session.saViewTenantId
}

/** GET /api/[tenant]/impact/imports — the merchant's own uploads, newest first (owner/admin). */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const adminError = await requireTenantAdmin(session, tenant.id)
    if (adminError) return adminError
    return successResponse(await listImports(tenant.id))
  } catch (error) {
    console.error("[GET /api/[tenant]/impact/imports]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/[tenant]/impact/imports — multipart with `file` (.xlsx/.csv).
 * The merchant uploads its own sales; same flow as the super-admin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const adminError = await requireTenantAdmin(session, tenant.id)
    if (adminError) return adminError
    if (readOnlyView(session)) return errorResponse("Vista de solo lectura", 403)

    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + 64 * 1024) {
      return errorResponse(
        `Archivo demasiado grande (máximo ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
        413,
      )
    }
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const file = formData.get("file")
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      return errorResponse("Solo se aceptan archivos .xlsx o .csv", 400)
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse(
        `Archivo demasiado grande (máximo ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
        400,
      )
    }

    const preview = await createImport({
      tenantId: tenant.id,
      file: { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) },
      userId: session.user.id,
    })
    if ("error" in preview) return errorResponse(preview.error, 400)
    return successResponse(preview, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/impact/imports]", error)
    return errorResponse("Internal server error", 500)
  }
}
