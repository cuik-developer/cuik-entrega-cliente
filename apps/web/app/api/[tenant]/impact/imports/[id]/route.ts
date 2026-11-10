import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { parseMapping } from "@/lib/loyalty/impact/columns"
import { deleteImport, processImport } from "@/lib/loyalty/impact/store"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const processSchema = z.object({
  headers: z.array(z.string().max(200)).min(1).max(200),
  mapping: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  options: z.object({
    retentionDays: z.number().int().min(7).max(365),
    excludedDnis: z.array(z.string().max(20)).max(200),
  }),
})

function readOnlyView(session: { user: { role?: string }; saViewTenantId?: string | null }) {
  return session.user.role === "super_admin" && !!session.saViewTenantId
}

/** POST /api/[tenant]/impact/imports/[id] { headers, mapping, options } — confirm the columns and compute. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const { tenant: slug, id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid import ID", 400)
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const adminError = await requireTenantAdmin(session, tenant.id)
    if (adminError) return adminError
    if (readOnlyView(session)) return errorResponse("Vista de solo lectura", 403)

    const parsed = processSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const mapping = parseMapping(parsed.data.mapping, parsed.data.headers.length)
    if (!mapping) return errorResponse("Mapeo de columnas inválido", 400)

    const result = await processImport({
      tenantId: tenant.id,
      importId: id,
      mapping,
      headers: parsed.data.headers,
      options: parsed.data.options,
    })
    if ("error" in result) return errorResponse(result.error, 400)
    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/[tenant]/impact/imports/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** DELETE /api/[tenant]/impact/imports/[id] — removes the upload, its sales and its corte. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const { tenant: slug, id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid import ID", 400)
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const adminError = await requireTenantAdmin(session, tenant.id)
    if (adminError) return adminError
    if (readOnlyView(session)) return errorResponse("Vista de solo lectura", 403)
    const ok = await deleteImport(id, tenant.id)
    if (!ok) return errorResponse("Carga no encontrada", 404)
    return successResponse({ id })
  } catch (error) {
    console.error("[DELETE /api/[tenant]/impact/imports/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
