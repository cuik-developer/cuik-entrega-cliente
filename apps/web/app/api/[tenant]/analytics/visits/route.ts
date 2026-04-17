import { and, clients, db, eq, sql, visits } from "@cuik/db"
import { analyticsQuerySchema } from "@cuik/shared/validators"

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
    const parsed = analyticsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return errorResponse("Invalid query parameters", 400, parsed.error.flatten())
    }

    const { from, to, granularity } = parsed.data
    const tz = tenant.timezone ?? "America/Lima"

    // Build date truncation based on granularity — always in tenant's timezone
    const localCreatedAt = sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})`
    const localClientCreatedAt = sql`(${clients.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})`
    let dateExpr: ReturnType<typeof sql>
    switch (granularity) {
      case "week":
        dateExpr = sql`date_trunc('week', ${localCreatedAt})::date`
        break
      case "month":
        dateExpr = sql`date_trunc('month', ${localCreatedAt})::date`
        break
      default:
        dateExpr = sql`(${localCreatedAt})::date`
    }

    // Query visits grouped by date from loyalty.visits directly
    const rows = await db
      .select({
        date: dateExpr.as("date"),
        totalVisits: sql<number>`COUNT(*)::int`.as("totalVisits"),
        uniqueClients: sql<number>`COUNT(DISTINCT ${visits.clientId})::int`.as("uniqueClients"),
        newClients:
          sql<number>`COUNT(DISTINCT CASE WHEN (${localClientCreatedAt})::date = (${localCreatedAt})::date THEN ${visits.clientId} END)::int`.as(
            "newClients",
          ),
      })
      .from(visits)
      .leftJoin(clients, eq(visits.clientId, clients.id))
      .where(
        and(
          eq(visits.tenantId, tenant.id),
          sql`(${localCreatedAt})::date >= ${from}`,
          sql`(${localCreatedAt})::date <= ${to}`,
        ),
      )
      .groupBy(dateExpr)
      .orderBy(dateExpr)

    return successResponse(rows)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/visits]", error)
    return errorResponse("Internal server error", 500)
  }
}
