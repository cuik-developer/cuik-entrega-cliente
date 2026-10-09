import { asc, db, desc, ilike, or, sql, tenants } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/**
 * Lightweight tenant lookup for the top-bar search: name or slug containing
 * `q`, at most 8 rows, no counts. `?all=1` lists every tenant by name (for
 * selectors). Each row carries the active program type and the branding
 * (logo, primary color) so lists can show the logo. The full list endpoint
 * stays for the table.
 */
const FIELDS = {
  id: tenants.id,
  name: tenants.name,
  slug: tenants.slug,
  status: tenants.status,
  logoUrl: sql<string | null>`${tenants.branding} ->> 'logoUrl'`,
  primaryColor: sql<string | null>`${tenants.branding} ->> 'primaryColor'`,
  // `${tenants}.id` (table-qualified): a bare `${tenants.id}` renders as "id" and would
  // resolve to p.id inside the subquery.
  program: sql<"stamps" | "points" | null>`(SELECT p.type::text FROM loyalty.promotions p
    WHERE p.tenant_id = ${tenants}.id AND p.active = true ORDER BY p.created_at DESC LIMIT 1)`,
}

export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const url = new URL(request.url)
    if (url.searchParams.get("all") === "1") {
      const all = await db.select(FIELDS).from(tenants).orderBy(asc(tenants.name)).limit(500)
      return successResponse(all)
    }
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60)
    if (q.length < 2) return successResponse([])
    // `%` and `_` are wildcards in ILIKE: match them literally.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

    const rows = await db
      .select(FIELDS)
      .from(tenants)
      .where(or(ilike(tenants.name, pattern), ilike(tenants.slug, pattern)))
      .orderBy(desc(tenants.createdAt))
      .limit(8)
    return successResponse(rows)
  } catch (error) {
    console.error("[GET /api/admin/tenants/suggest]", error)
    return errorResponse("Internal server error", 500)
  }
}
