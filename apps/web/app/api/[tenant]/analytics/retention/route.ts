import { and, db, eq, retentionCohorts, sql } from "@cuik/db"
import { retentionQuerySchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
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

    const url = new URL(request.url)
    const parsed = retentionQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return errorResponse("Invalid query parameters", 400, parsed.error.flatten())
    }

    const { months } = parsed.data

    // Calculate the start date based on how many months back
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1)
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`

    const rows = await db
      .select({
        cohortMonth: retentionCohorts.cohortMonth,
        monthOffset: retentionCohorts.monthOffset,
        clientsCount: retentionCohorts.clientsCount,
        retentionPct: retentionCohorts.retentionPct,
      })
      .from(retentionCohorts)
      .where(
        and(
          eq(retentionCohorts.tenantId, tenant.id),
          sql`${retentionCohorts.cohortMonth} >= ${startDateStr}`,
        ),
      )
      .orderBy(retentionCohorts.cohortMonth, retentionCohorts.monthOffset)

    return successResponse(rows)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/retention]", error)
    return errorResponse("Internal server error", 500)
  }
}
