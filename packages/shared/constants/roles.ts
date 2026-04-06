export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  USER: "user",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_REDIRECTS: Record<Role, string> = {
  super_admin: "/admin/tenants",
  admin: "/panel",
  user: "/cajero/escanear",
}
