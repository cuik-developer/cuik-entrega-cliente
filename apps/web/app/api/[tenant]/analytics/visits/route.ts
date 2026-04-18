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
    const rawTz = tenant.timezone ?? "America/Lima"
    // Sanitize: keep only IANA-compatible chars to prevent injection, then inline
    // as a literal so SELECT/GROUP BY produce byte-identical expressions (see
    // long comment in admin/metricas/actions.ts for the underlying bug).
    const tz = rawTz.replace(/[^A-Za-z0-9_/+-]/g, "") || "America/Lima"
    const tzLit = sql.raw(`'${tz}'`)

    // Build date truncation based on granularity — always in tenant's timezone
    const localCreatedAt = sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
    const localClientCreatedAt = sql`(${clients.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
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

    // Query visits grouped by date from loyalty.visits directly.
    // IMPORTANT: cast the date bucket to text in the SELECT so the wire
    // format is a plain "YYYY-MM-DD" string. Returning a PG `date` makes
    // node-postgres parse it as a Date at UTC midnight, which the browser
    // then re-formats in its local timezone — shifting the label one day
    // back in negative-offset zones (Lima = UTC-5).
    const rows = await db
      .select({
        date: sql<string>`to_char(${dateExpr}, 'YYYY-MM-DD')`.as("date"),
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
