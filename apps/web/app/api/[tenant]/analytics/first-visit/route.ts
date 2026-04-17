import { db, eq, sql, visits } from "@cuik/db"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/**
 * GET /api/[tenant]/analytics/first-visit
 * Earliest visit date for this tenant (bucketed in tenant's local timezone).
 * Used by date range pickers to constrain the minimum selectable date.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = requireRole(session, "admin")
  if (roleError) return roleError

  const { tenant: slug } = await params
  const tenant = await resolveTenant(slug)
  if (!tenant) return errorResponse("Tenant not found", 404)

  const membershipError = await requireTenantMembership(session, tenant.id)
  if (membershipError) return membershipError

  const tz = tenant.timezone ?? "America/Lima"

  const rows = await db
    .select({
      firstVisit: sql<string | null>`TO_CHAR(MIN(${visits.createdAt}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
    })
    .from(visits)
    .where(eq(visits.tenantId, tenant.id))

  return successResponse({ firstVisitDate: rows[0]?.firstVisit ?? null })
}
