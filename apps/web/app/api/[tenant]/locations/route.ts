import { and, db, eq, locations } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
      })
      .from(locations)
      .where(and(eq(locations.tenantId, tenant.id), eq(locations.active, true)))

    return successResponse(rows)
  } catch (error) {
    console.error("[GET /api/[tenant]/locations]", error)
    return errorResponse("Internal server error", 500)
  }
}
