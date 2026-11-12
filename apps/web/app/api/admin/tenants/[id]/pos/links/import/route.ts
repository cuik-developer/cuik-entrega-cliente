import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { applyLinks, parseLinksFile } from "@/lib/pos/links-import"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * POST /api/admin/tenants/[id]/pos/links/import  (multipart: file)
 * Applies the "Enlazar" decisions of a reviewed sheet (visita_id + venta_id
 * or the POS order reference + Decisión). Returns what was linked and the
 * rows that could not be.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const file = formData.get("file")
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    if (file.size > MAX_FILE_BYTES)
      return errorResponse("Archivo demasiado grande (máximo 10 MB)", 400)
    const parsed = await parseLinksFile(Buffer.from(await file.arrayBuffer()), file.name)
    if ("error" in parsed) return errorResponse(parsed.error, 400)
    return successResponse(await applyLinks(id, parsed.rows))
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/pos/links/import]", error)
    return errorResponse("Internal server error", 500)
  }
}
