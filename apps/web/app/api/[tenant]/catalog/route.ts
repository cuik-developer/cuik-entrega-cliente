import { and, asc, db, desc, eq, promotions, rewardCatalog } from "@cuik/db"
import { createCatalogItemSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

type Params = { params: Promise<{ tenant: string }> }

async function guard(request: Request, params: Params["params"]) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return { error: authError }
  const roleError = requireRole(session, "admin")
  if (roleError) return { error: roleError }
  const { tenant: slug } = await params
  const tenant = await resolveTenant(slug)
  if (!tenant) return { error: errorResponse("Tenant not found", 404) }
  const membershipError = await requireTenantMembership(session, tenant.id)
  if (membershipError) return { error: membershipError }
  return { tenant }
}

/**
 * GET /api/[tenant]/catalog
 * The tenant's reward catalog (active and inactive), for the admin panel.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error

    const [items, promo] = await Promise.all([
      db
        .select()
        .from(rewardCatalog)
        .where(eq(rewardCatalog.tenantId, g.tenant.id))
        .orderBy(desc(rewardCatalog.active), asc(rewardCatalog.sortOrder), asc(rewardCatalog.name)),
      db
        .select({ id: promotions.id })
        .from(promotions)
        .where(
          and(
            eq(promotions.tenantId, g.tenant.id),
            eq(promotions.type, "points"),
            eq(promotions.active, true),
          ),
        )
        .limit(1),
    ])

    return successResponse({ items, pointsProgramActive: Boolean(promo[0]) })
  } catch (error) {
    console.error("[GET /api/[tenant]/catalog]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/[tenant]/catalog  { name, description?, imageUrl?, pointsCost, category?, active?, sortOrder? }
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error

    const parsed = createCatalogItemSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const [item] = await db
      .insert(rewardCatalog)
      .values({ ...parsed.data, tenantId: g.tenant.id })
      .returning()

    return successResponse(item, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/catalog]", error)
    return errorResponse("Internal server error", 500)
  }
}
