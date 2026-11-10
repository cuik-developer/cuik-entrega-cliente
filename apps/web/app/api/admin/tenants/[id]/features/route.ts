import { db, eq, sql, tenants } from "@cuik/db"
import { parseTenantFeatures, tenantFeaturesSchema } from "@cuik/shared/validators"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ id: string }> }

/** GET /api/admin/tenants/[id]/features — what Cuik has turned on for this tenant. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const [row] = await db
      .select({ features: tenants.features })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
    if (!row) return errorResponse("Tenant not found", 404)
    return successResponse(parseTenantFeatures(row.features))
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/features]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * PATCH /api/admin/tenants/[id]/features — turn features on or off. Super-admin
 * only (not Equipo Cuik staff, not the merchant). Only the keys sent change;
 * the rest of tenants.features is kept.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const parsed = tenantFeaturesSchema.strict().safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const [row] = await db
      .update(tenants)
      .set({
        features: sql`coalesce(${tenants.features}, '{}'::jsonb) || ${JSON.stringify(parsed.data)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning({ features: tenants.features })
    if (!row) return errorResponse("Tenant not found", 404)
    return successResponse(parseTenantFeatures(row.features))
  } catch (error) {
    console.error("[PATCH /api/admin/tenants/[id]/features]", error)
    return errorResponse("Internal server error", 500)
  }
}
