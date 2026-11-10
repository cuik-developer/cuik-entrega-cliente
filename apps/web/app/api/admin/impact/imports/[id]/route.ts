import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { parseMapping } from "@/lib/loyalty/impact/columns"
import { deleteImport, processImport } from "@/lib/loyalty/impact/store"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const processSchema = z.object({
  tenantId: z.string().regex(UUID),
  headers: z.array(z.string().max(200)).min(1).max(200),
  mapping: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  options: z.object({
    retentionDays: z.number().int().min(7).max(365),
    excludedDnis: z.array(z.string().max(20)).max(200),
  }),
})

/**
 * POST /api/admin/impact/imports/[id] { tenantId, headers, mapping, options }
 * Confirms the columns, loads the sales and computes the corte.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid import ID", 400)
    const parsed = processSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const mapping = parseMapping(parsed.data.mapping, parsed.data.headers.length)
    if (!mapping) return errorResponse("Mapeo de columnas inválido", 400)

    const result = await processImport({
      tenantId: parsed.data.tenantId,
      importId: id,
      mapping,
      headers: parsed.data.headers,
      options: parsed.data.options,
    })
    if ("error" in result) return errorResponse(result.error, 400)
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/admin/impact/imports/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** DELETE /api/admin/impact/imports/[id]?tenantId= — removes the upload, its sales and its corte. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    const tenantId = new URL(request.url).searchParams.get("tenantId") ?? ""
    if (!UUID.test(id) || !UUID.test(tenantId)) return errorResponse("Invalid ID", 400)
    const ok = await deleteImport(id, tenantId)
    if (!ok) return errorResponse("Carga no encontrada", 404)
    return successResponse({ id })
  } catch (error) {
    console.error("[DELETE /api/admin/impact/imports/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
