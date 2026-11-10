import { db, eq, tenants } from "@cuik/db"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { MAX_FILE_BYTES } from "@/lib/loyalty/impact/parse"
import { createImport, listImports } from "@/lib/loyalty/impact/store"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/admin/impact/imports?tenantId= — the tenant's uploads, newest first. */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const tenantId = new URL(request.url).searchParams.get("tenantId") ?? ""
    if (!UUID.test(tenantId)) return errorResponse("Invalid tenant ID", 400)
    return successResponse(await listImports(tenantId))
  } catch (error) {
    console.error("[GET /api/admin/impact/imports]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/admin/impact/imports — multipart with `tenantId` and `file`
 * (.xlsx or .csv). Keeps the file and answers with the headers, a sample and
 * the proposed column mapping; nothing is computed yet.
 */
export async function POST(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

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
    const tenantId = String(formData.get("tenantId") ?? "")
    if (!UUID.test(tenantId)) return errorResponse("Invalid tenant ID", 400)
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

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
      tenantId,
      file: { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) },
      userId: session.user.id,
    })
    if ("error" in preview) return errorResponse(preview.error, 400)
    return successResponse(preview, 201)
  } catch (error) {
    console.error("[POST /api/admin/impact/imports]", error)
    return errorResponse("Internal server error", 500)
  }
}
