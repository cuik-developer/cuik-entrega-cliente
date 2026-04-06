import { asc, clientTags, db, eq } from "@cuik/db"
import { createTagSchema } from "@cuik/shared/validators/crm-schema"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

type Params = { params: Promise<{ tenant: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const tags = await db
      .select()
      .from(clientTags)
      .where(eq(clientTags.tenantId, tenant.id))
      .orderBy(asc(clientTags.name))

    return successResponse(tags)
  } catch (error) {
    console.error("[GET /api/[tenant]/tags]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const body = await request.json()
    const parsed = createTagSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, parsed.error.flatten())
    }

    const [tag] = await db
      .insert(clientTags)
      .values({
        tenantId: tenant.id,
        name: parsed.data.name,
        color: parsed.data.color,
      })
      .returning()

    return successResponse(tag, 201)
  } catch (error) {
    // Handle unique constraint violation (duplicate tag name for tenant)
    if (error instanceof Error && error.message.includes("unique")) {
      return errorResponse("A tag with this name already exists", 409)
    }
    console.error("[POST /api/[tenant]/tags]", error)
    return errorResponse("Internal server error", 500)
  }
}
