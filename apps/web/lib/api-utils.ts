import { and, db, eq, inArray, member, organization, tenants, user } from "@cuik/db"
import { auth } from "@/lib/auth"
import { saViewTenantFromCookieHeader } from "@/lib/sa-view"
import {
  type AdminAccess,
  canAccess,
  normalizeStaffPermissions,
  type StaffPermission,
} from "@/lib/staff-permissions"

// --- Response helpers ---

export function successResponse<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status })
}

export function errorResponse(error: string, status = 400, details?: unknown) {
  return Response.json({ success: false, error, ...(details ? { details } : {}) }, { status })
}

// --- Auth helpers ---

export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return { session: null, error: errorResponse("Unauthorized", 401) }
  }

  // Super-admin "ver como el comercio": the tenant id comes from an encrypted,
  // expiring cookie and is only trusted for super_admin sessions. Writes are
  // blocked by the middleware (non-GET tenant API calls return 403), so the
  // helpers below can treat it as admin membership for reads.
  const saViewTenantId =
    (session.user as { role?: string }).role === "super_admin"
      ? saViewTenantFromCookieHeader(request.headers.get("cookie"))
      : null

  return { session: { ...session, saViewTenantId }, error: null }
}

export function requireRole(
  session: { user: { role?: string }; saViewTenantId?: string | null },
  role: string,
) {
  const userRole = session.user.role ?? "user"
  if (userRole === role) return null
  // A super-admin viewing a tenant passes "admin" checks (read-only, see above).
  if (role === "admin" && userRole === "super_admin" && session.saViewTenantId) return null
  return errorResponse("Forbidden — insufficient role", 403)
}

// --- Equipo Cuik (staff) helpers ---

/** Permissions granted to a staff user, read fresh from the DB (never from the client). */
export async function getStaffPermissions(userId: string): Promise<StaffPermission[]> {
  const [row] = await db
    .select({ role: user.role, permissions: user.staffPermissions })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!row || row.role !== "staff") return []
  return normalizeStaffPermissions(row.permissions)
}

/** Super-admin access of a session: owner, staff with their permissions, or none. */
export async function adminAccessOf(session: {
  user: { id: string; role?: string | null }
}): Promise<AdminAccess> {
  const role = session.user.role ?? "user"
  if (role === "super_admin") return { kind: "super_admin" }
  if (role === "staff")
    return { kind: "staff", permissions: await getStaffPermissions(session.user.id) }
  return { kind: "none" }
}

/**
 * Null when the caller is super_admin, or staff holding at least one of
 * `permission`; 403 otherwise. Use it ONLY on operations deliberately opened
 * to Equipo Cuik — everything else keeps `requireRole(session, "super_admin")`.
 */
export async function requireSuperAdminOr(
  session: { user: { id: string; role?: string | null } },
  permission: StaffPermission | readonly StaffPermission[],
) {
  const role = session.user.role ?? "user"
  if (role === "super_admin") return null
  if (role === "staff" && canAccess(await adminAccessOf(session), permission)) return null
  return errorResponse("Forbidden — insufficient role", 403)
}

/** True when the session belongs to an Equipo Cuik member (responses must be redacted). */
export function isStaffSession(session: { user: { role?: string | null } }): boolean {
  return session.user.role === "staff"
}

// --- Tenant helpers ---

export async function resolveTenant(slug: string) {
  const results = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.slug, slug), inArray(tenants.status, ["trial", "active"])))
    .limit(1)

  return results[0] ?? null
}

export async function requireTenantMembership(
  session: { user: { id: string; role?: string }; saViewTenantId?: string | null },
  tenantId: string,
) {
  // Super-admin viewing exactly this tenant (read-only, enforced by middleware).
  if (session.user.role === "super_admin" && session.saViewTenantId === tenantId) {
    return null
  }

  // Find the tenant to get its slug and owner
  const tenantResults = await db
    .select({ slug: tenants.slug, ownerId: tenants.ownerId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const tenant = tenantResults[0]
  if (!tenant) {
    return errorResponse("Tenant not found", 404)
  }

  // Owner always has access
  if (tenant.ownerId === session.user.id) {
    return null
  }

  // Find the organization that matches this tenant (org.slug === tenant.slug)
  const orgResults = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, tenant.slug))
    .limit(1)

  const org = orgResults[0]
  if (!org) {
    return errorResponse("Forbidden — no organization linked to this tenant", 403)
  }

  // Verify the user is a member of THIS specific organization
  const memberResults = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, org.id)))
    .limit(1)

  if (memberResults.length === 0) {
    return errorResponse("Forbidden — not a member of this tenant", 403)
  }

  return null
}

// --- Pagination helpers ---

export function parsePagination(
  searchParams: URLSearchParams,
  defaults?: { page?: number; limit?: number },
) {
  const defaultPage = defaults?.page ?? 1
  const defaultLimit = defaults?.limit ?? 20

  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? String(defaultPage), 10))
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? String(defaultLimit), 10)),
  )

  return { page, limit, offset: (page - 1) * limit }
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * Admin-level access to a tenant: the organization owner or an admin member
 * (`member.role`), or the super-admin read-only view of this tenant. Replaces
 * "global role admin + any membership" on the merchant panel routes, so a
 * cashier who happens to be admin of ANOTHER tenant cannot administer this one.
 */
export async function requireTenantAdmin(
  session: { user: { id: string; role?: string }; saViewTenantId?: string | null },
  tenantId: string,
) {
  if (session.user.role === "super_admin" && session.saViewTenantId === tenantId) return null

  const [tenant] = await db
    .select({ slug: tenants.slug, ownerId: tenants.ownerId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  if (!tenant) return errorResponse("Tenant not found", 404)
  if (tenant.ownerId === session.user.id) return null

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, session.user.id), eq(organization.slug, tenant.slug)))
    .limit(1)
  if (!row) return errorResponse("Forbidden — not a member of this tenant", 403)
  if (row.role !== "owner" && row.role !== "admin") {
    return errorResponse("Forbidden — admin role required in this tenant", 403)
  }
  return null
}
