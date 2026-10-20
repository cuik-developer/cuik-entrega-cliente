/**
 * Equipo Cuik — limited super-admin staff (global `user.role = "staff"`) with
 * per-area permissions stored in `user.staff_permissions`. DEFAULT DENY: a
 * staff member only reaches the areas listed here that were granted, and only
 * the operations each area opens (see the server checks). The owner
 * (`super_admin`) keeps full access. Pure module: safe on client and server.
 */

export const STAFF_PERMISSIONS = [
  "designs",
  "branding",
  "campaigns",
  "tenants_view",
  "metrics",
] as const

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  designs: "Diseños de pases",
  branding: "Branding",
  campaigns: "Campañas",
  tenants_view: "Tenants (solo lectura)",
  metrics: "Métricas",
}

export const STAFF_PERMISSION_DESCRIPTIONS: Record<StaffPermission, string> = {
  designs: "Ver y editar diseños y guardar borradores. No publica: el dueño revisa y publica.",
  branding: "Editar y guardar el branding de los comercios.",
  campaigns: "Ver las campañas y su detalle, sin datos de clientes. No envía ni reintenta.",
  tenants_view: "Ver la lista y la ficha de cada comercio, sin datos de clientes ni facturación.",
  metrics: "Ver las métricas agregadas de la plataforma, sin ingresos ni exportaciones.",
}

const PERMISSION_SET: ReadonlySet<string> = new Set(STAFF_PERMISSIONS)

export function isStaffPermission(value: unknown): value is StaffPermission {
  return typeof value === "string" && PERMISSION_SET.has(value)
}

/** Known permission keys only, deduplicated, in canonical order. Anything else → []. */
export function normalizeStaffPermissions(raw: unknown): StaffPermission[] {
  if (!Array.isArray(raw)) return []
  const given = new Set(raw.filter(isStaffPermission))
  return STAFF_PERMISSIONS.filter((p) => given.has(p))
}

/** What the current super-admin area user may do. */
export type AdminAccess =
  | { kind: "super_admin" }
  | { kind: "staff"; permissions: StaffPermission[] }
  | { kind: "none" }

export function accessFor(role: string | null | undefined, rawPermissions: unknown): AdminAccess {
  if (role === "super_admin") return { kind: "super_admin" }
  if (role === "staff")
    return { kind: "staff", permissions: normalizeStaffPermissions(rawPermissions) }
  return { kind: "none" }
}

/**
 * True for the owner, or for staff holding at least one of `required`.
 * No permission given = super_admin only.
 */
export function canAccess(
  access: AdminAccess,
  required?: StaffPermission | readonly StaffPermission[] | null,
): boolean {
  if (access.kind === "super_admin") return true
  if (access.kind !== "staff" || !required) return false
  const list: readonly StaffPermission[] = typeof required === "string" ? [required] : required
  return list.some((p) => access.permissions.includes(p))
}

/**
 * Super-admin sections a staff member can be granted, by path prefix. Every
 * other /admin path is owner-only (finanzas, prospectos, solicitudes, exportar,
 * reclamaciones, planes, configuración, office, equipo…).
 */
export const STAFF_SECTIONS: ReadonlyArray<{ prefix: string; permission: StaffPermission }> = [
  { prefix: "/admin/pases", permission: "designs" },
  { prefix: "/admin/editor", permission: "designs" },
  { prefix: "/admin/branding", permission: "branding" },
  { prefix: "/admin/campanas", permission: "campaigns" },
  { prefix: "/admin/tenants", permission: "tenants_view" },
  { prefix: "/admin/metricas", permission: "metrics" },
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Permission that opens `pathname` to staff, or null when it is owner-only. */
export function permissionForAdminPath(pathname: string): StaffPermission | null {
  return STAFF_SECTIONS.find((s) => matchesPrefix(pathname, s.prefix))?.permission ?? null
}

/** Whether `access` may open the super-admin page at `pathname`. "/admin" itself is a redirect. */
export function canOpenAdminPath(access: AdminAccess, pathname: string): boolean {
  if (access.kind === "super_admin") return true
  if (access.kind !== "staff") return false
  if (pathname === "/admin") return true
  const permission = permissionForAdminPath(pathname)
  return permission !== null && access.permissions.includes(permission)
}

/** Landing page for staff: the first section they hold, in menu order. */
const LANDING_ORDER: ReadonlyArray<{ href: string; permission: StaffPermission }> = [
  { href: "/admin/tenants", permission: "tenants_view" },
  { href: "/admin/metricas", permission: "metrics" },
  { href: "/admin/pases", permission: "designs" },
  { href: "/admin/campanas", permission: "campaigns" },
  { href: "/admin/branding", permission: "branding" },
]

export function adminLandingHref(access: AdminAccess): string | null {
  if (access.kind === "super_admin") return "/admin/tenants"
  if (access.kind !== "staff") return null
  return LANDING_ORDER.find((l) => access.permissions.includes(l.permission))?.href ?? null
}
