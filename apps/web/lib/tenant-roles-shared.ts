/**
 * Roles inside a tenant, client-safe part (no database imports): types,
 * labels and the rank used to order and compare them. See tenant-roles.ts.
 */

export type TenantRole = "owner" | "admin" | "member"

export const TENANT_ROLE_RANK: Record<TenantRole, number> = { owner: 3, admin: 2, member: 1 }

export const TENANT_ROLE_LABEL: Record<TenantRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  member: "Cajero",
}

export function asTenantRole(role: string | null | undefined): TenantRole {
  return role === "owner" || role === "admin" ? role : "member"
}

/** Admin-level inside the tenant (owner or admin). */
export function isTenantAdmin(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin"
}
