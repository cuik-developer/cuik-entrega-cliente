import { db, sql, visits } from "@cuik/db"

import { requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/reports/first-visit
 * Returns the earliest visit date across the entire platform (super-admin scope).
 * Used by the custom date range picker to set its minDate.
 * Response: { firstVisitDate: "YYYY-MM-DD" | null }
 */
export async function GET(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const rows = await db
    .select({
      firstVisit: sql<string | null>`TO_CHAR(MIN(${visits.createdAt}) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima', 'YYYY-MM-DD')`,
    })
    .from(visits)

  return successResponse({ firstVisitDate: rows[0]?.firstVisit ?? null })
}
