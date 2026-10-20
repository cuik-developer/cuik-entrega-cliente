export const ROLES = {
  SUPER_ADMIN: "super_admin",
  /** Equipo Cuik: limited super-admin with per-area permissions (user.staff_permissions). */
  STAFF: "staff",
  ADMIN: "admin",
  USER: "user",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_REDIRECTS: Record<Role, string> = {
  super_admin: "/admin/tenants",
  // "/admin" sends each staff member to the first section they may use.
  staff: "/admin",
  admin: "/panel",
  user: "/cajero/escanear",
}
