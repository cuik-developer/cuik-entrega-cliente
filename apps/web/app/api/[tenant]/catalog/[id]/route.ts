import { and, db, eq, rewardCatalog } from "@cuik/db"
import { updateCatalogItemSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

type Params = { params: Promise<{ tenant: string; id: string }> }

async function guard(request: Request, params: Params["params"]) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return { error: authError }
  const roleError = requireRole(session, "admin")
  if (roleError) return { error: roleError }
  const { tenant: slug, id } = await params
  const tenant = await resolveTenant(slug)
  if (!tenant) return { error: errorResponse("Tenant not found", 404) }
  const membershipError = await requireTenantMembership(session, tenant.id)
  if (membershipError) return { error: membershipError }
  return { tenant, id }
}

/**
 * PATCH /api/[tenant]/catalog/[id]  — partial update (name, photo, cost, category, active, order).
 * Items are scoped by tenant: an id from another business is a 404.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error

    const parsed = updateCatalogItemSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    if (Object.keys(parsed.data).length === 0) return errorResponse("Nothing to update", 400)

    const [item] = await db
      .update(rewardCatalog)
      .set(parsed.data)
      .where(and(eq(rewardCatalog.id, g.id), eq(rewardCatalog.tenantId, g.tenant.id)))
      .returning()
    if (!item) return errorResponse("Catalog item not found", 404)

    return successResponse(item)
  } catch (error) {
    console.error("[PATCH /api/[tenant]/catalog/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * DELETE /api/[tenant]/catalog/[id] — soft delete (active = false). Redemptions
 * reference catalog rows, so rows are never removed.
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error

    const [item] = await db
      .update(rewardCatalog)
      .set({ active: false })
      .where(and(eq(rewardCatalog.id, g.id), eq(rewardCatalog.tenantId, g.tenant.id)))
      .returning({ id: rewardCatalog.id })
    if (!item) return errorResponse("Catalog item not found", 404)

    return successResponse({ id: item.id, active: false })
  } catch (error) {
    console.error("[DELETE /api/[tenant]/catalog/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
