import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { MAX_FILE_BYTES } from "@/lib/loyalty/impact/parse"
import { applyMaster, masterSummary, previewMaster } from "@/lib/pos/products"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MASTER_BYTES = Math.min(MAX_FILE_BYTES, 20 * 1024 * 1024)

type Params = { params: Promise<{ id: string }> }

/** GET /api/admin/tenants/[id]/products — the product master's summary. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    return successResponse(await masterSummary(id))
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/products]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/admin/tenants/[id]/products — multipart with `file` (.xlsx/.csv).
 * Without `mapping`: answers the headers, a sample and the detected mapping
 * (nothing saved). With `mapping` (JSON): upserts the master.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)

    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > MAX_MASTER_BYTES + 64 * 1024) {
      return errorResponse("Archivo demasiado grande (máximo 20 MB)", 413)
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
    if (file.size > MAX_MASTER_BYTES)
      return errorResponse("Archivo demasiado grande (máximo 20 MB)", 400)
    const buffer = Buffer.from(await file.arrayBuffer())
    const rawMapping = formData.get("mapping")
    if (typeof rawMapping !== "string" || !rawMapping) {
      const preview = await previewMaster({ name: file.name, buffer })
      if ("error" in preview) return errorResponse(preview.error, 400)
      return successResponse(preview)
    }
    let mapping: unknown
    try {
      mapping = JSON.parse(rawMapping)
    } catch {
      return errorResponse("Mapping inválido", 400)
    }
    const result = await applyMaster({ tenantId: id, file: { name: file.name, buffer }, mapping })
    if ("error" in result) return errorResponse(result.error, 400)
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/products]", error)
    return errorResponse("Internal server error", 500)
  }
}
