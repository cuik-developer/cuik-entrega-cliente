import { and, db, eq, member, organization, sql, tenants, user } from "@cuik/db"

/**
 * Roles inside a tenant (Better Auth organization `member.role`), the single
 * source of truth for who can do what in a merchant:
 *
 * - owner  → the person who registered the tenant (one per tenant): everything,
 *            plus adding/removing admins and transferring ownership.
 * - admin  → the whole merchant panel, plus adding/removing cashiers.
 * - member → cashier: only the cashier app.
 *
 * The global `user.role` ("admin" | "user") is derived from these memberships
 * (`syncGlobalRole`) so the login redirect and the /panel gate keep working;
 * `super_admin` is never touched.
 */

import { asTenantRole, isTenantAdmin, type TenantRole } from "./tenant-roles-shared"

export * from "./tenant-roles-shared"

/** The caller's role in one organization, or null when not a member. */
export async function getMemberRole(
  userId: string,
  organizationId: string,
): Promise<TenantRole | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    // Duplicate membership rows (no unique index): take the highest.
    .orderBy(sql`CASE ${member.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`)
    .limit(1)
  return row ? asTenantRole(row.role) : null
}

/**
 * Recompute the global role of a user from every membership: owner or admin
 * somewhere → "admin", otherwise "user". Super-admins are left alone.
 */
export async function syncGlobalRole(userId: string): Promise<"admin" | "user" | "super_admin"> {
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
  if (!u) return "user"
  if (u.role === "super_admin") return "super_admin"
  // Only organizations linked to a tenant count: Better Auth lets any user
  // create an organization of their own, which must never grant a role here.
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(tenants, eq(tenants.slug, organization.slug))
    .where(eq(member.userId, userId))
  const next = rows.some((r) => isTenantAdmin(r.role)) ? "admin" : "user"
  if (u.role !== next) await db.update(user).set({ role: next }).where(eq(user.id, userId))
  return next
}

/** Organization + tenant linked by slug, for a tenant id. */
export async function organizationOfTenant(
  tenantId: string,
): Promise<{ orgId: string; ownerId: string | null; slug: string } | null> {
  const [row] = await db
    .select({ orgId: organization.id, ownerId: tenants.ownerId, slug: tenants.slug })
    .from(tenants)
    .innerJoin(organization, eq(organization.slug, tenants.slug))
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return row ?? null
}

/** Every member of an organization with the user's identity, highest role first. */
export async function listTeam(organizationId: string) {
  const rows = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      name: user.name,
      email: user.email,
      banned: user.banned,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(sql`CASE ${member.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`, user.name)
  return rows.map((r) => ({ ...r, role: asTenantRole(r.role) }))
}
