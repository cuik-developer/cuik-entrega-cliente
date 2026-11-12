import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { computeSyncedCorte } from "@/lib/pos/corte"
import { linkSaleToVisit, unlinkSale } from "@/lib/pos/links-review"
import { OdooError } from "@/lib/pos/odoo-client"
import { syncTenant, testConnection } from "@/lib/pos/sync"
import { connectionFieldsSchema, dayStringSchema } from "../connection-schema"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ id: string; action: string }> }

export const maxDuration = 300

const testSchema = connectionFieldsSchema
  .extend({
    // Empty database = "ask the server which ones exist".
    database: z.string().trim().max(120),
  })
  .partial()
  .extend({
    apiKey: z.string().trim().max(500).optional(),
    startDate: dayStringSchema.optional(),
  })
const syncSchema = z.object({ full: z.boolean().optional() })
const corteSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
const linkSchema = z.object({ saleId: z.string().regex(UUID), visitId: z.string().regex(UUID) })
const unlinkSchema = z.object({ saleId: z.string().regex(UUID) })

/** Validación de enlaces: a link made by hand, or an inferred/manual one undone. */
async function linkAction(tenantId: string, action: "link" | "unlink", body: unknown) {
  if (action === "link") {
    const parsed = linkSchema.safeParse(body)
    if (!parsed.success) return errorResponse("Datos inválidos", 400)
    const result = await linkSaleToVisit(tenantId, parsed.data.saleId, parsed.data.visitId)
    return result.ok ? successResponse({ linked: true }) : errorResponse(result.error, 400)
  }
  const parsed = unlinkSchema.safeParse(body)
  if (!parsed.success) return errorResponse("Datos inválidos", 400)
  const result = await unlinkSale(tenantId, parsed.data.saleId)
  return result.ok ? successResponse({ unlinked: true }) : errorResponse(result.error, 400)
}

/**
 * POST /api/admin/tenants/[id]/pos/test   { baseUrl?, database?, login?, apiKey? } — login + counts with the form's values, nothing written
 * POST /api/admin/tenants/[id]/pos/sync   { full? }  — one sync run now
 * POST /api/admin/tenants/[id]/pos/corte  { month }  — (re)compute a synced month's corte
 * POST /api/admin/tenants/[id]/pos/link   { saleId, visitId } — link a sale to a stamp by hand (Validación de enlaces)
 * POST /api/admin/tenants/[id]/pos/unlink { saleId } — undo an inferred or manual link
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id, action } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const raw = await request.json().catch(() => ({}))
    const body: unknown = raw && typeof raw === "object" ? raw : {}

    if (action === "test") {
      const parsed = testSchema.safeParse(body)
      if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
      const { apiKey, ...rest } = parsed.data
      try {
        return successResponse(await testConnection(id, { ...rest, apiKey: apiKey || undefined }))
      } catch (err) {
        if (err instanceof OdooError) return errorResponse(err.message, 400)
        throw err
      }
    }
    if (action === "sync") {
      const parsed = syncSchema.safeParse(body)
      if (!parsed.success) return errorResponse("Validation failed", 400)
      const result = await syncTenant(id, { full: parsed.data.full === true })
      return successResponse(result)
    }
    if (action === "corte") {
      const parsed = corteSchema.safeParse(body)
      if (!parsed.success) return errorResponse("Mes inválido", 400)
      const result = await computeSyncedCorte(id, parsed.data.month)
      if ("error" in result) return errorResponse(result.error, 400)
      return successResponse(result)
    }
    if (action === "link" || action === "unlink") return linkAction(id, action, body)
    return errorResponse("Unknown action", 404)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/pos/[action]]", error)
    return errorResponse("Internal server error", 500)
  }
}
