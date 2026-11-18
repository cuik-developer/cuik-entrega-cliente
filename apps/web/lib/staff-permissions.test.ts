import { describe, expect, it } from "vitest"
import {
  accessFor,
  adminLandingHref,
  canAccess,
  canOpenAdminPath,
  normalizeStaffPermissions,
  permissionForAdminPath,
  STAFF_PERMISSIONS,
  STAFF_VIEWS,
  staffAccessSummary,
  staffViewLevel,
  withStaffViewLevel,
} from "./staff-permissions"

describe("normalizeStaffPermissions", () => {
  it("keeps known keys once, in canonical order", () => {
    expect(normalizeStaffPermissions(["metrics", "designs", "designs", "hack", 3])).toEqual([
      "designs",
      "metrics",
    ])
  })
  it("brings designs along with designs_publish", () => {
    expect(normalizeStaffPermissions(["designs_publish"])).toEqual(["designs", "designs_publish"])
  })
  it("treats null and non-arrays as no permission", () => {
    expect(normalizeStaffPermissions(null)).toEqual([])
    expect(normalizeStaffPermissions("designs")).toEqual([])
  })
})

describe("accessFor / canAccess", () => {
  const owner = accessFor("super_admin", null)
  const diego = accessFor("staff", ["designs"])
  const empty = accessFor("staff", null)

  it("owner can do everything, including owner-only operations", () => {
    expect(canAccess(owner, "metrics")).toBe(true)
    expect(canAccess(owner)).toBe(true)
  })
  it("staff only gets granted permissions (default deny)", () => {
    expect(canAccess(diego, "designs")).toBe(true)
    expect(canAccess(diego, "metrics")).toBe(false)
    expect(canAccess(diego, ["metrics", "designs"])).toBe(true)
    expect(canAccess(diego)).toBe(false)
    expect(canAccess(empty, "designs")).toBe(false)
  })
  it("merchant admins and cashiers get nothing, even with a stray permission list", () => {
    expect(canAccess(accessFor("admin", ["designs"]), "designs")).toBe(false)
    expect(canAccess(accessFor("user", ["designs"]), "designs")).toBe(false)
    expect(canAccess(accessFor(undefined, null), "designs")).toBe(false)
  })
})

describe("admin paths", () => {
  const diego = accessFor("staff", ["designs"])

  it("maps sections to permissions; everything else is owner-only", () => {
    expect(permissionForAdminPath("/admin/pases")).toBe("designs")
    expect(permissionForAdminPath("/admin/pases/123/editor")).toBe("designs")
    expect(permissionForAdminPath("/admin/tenants/abc")).toBe("tenants_view")
    expect(permissionForAdminPath("/admin/finanzas")).toBeNull()
    // Only the Tablero opens; every other Finanzas page stays owner-only.
    expect(permissionForAdminPath("/admin/finanzas/tablero")).toBe("finance_dashboard")
    for (const p of [
      "inicio",
      "cobranza",
      "ventas",
      "compras",
      "cierres",
      "empresa",
      "prospectos",
    ]) {
      expect(permissionForAdminPath(`/admin/finanzas/${p}`)).toBeNull()
    }
    expect(permissionForAdminPath("/admin/equipo")).toBeNull()
    // Prefix must match a whole segment.
    expect(permissionForAdminPath("/admin/pasesx")).toBeNull()
  })

  it("staff opens only granted sections; owner opens all", () => {
    expect(canOpenAdminPath(diego, "/admin/pases/1/editor")).toBe(true)
    expect(canOpenAdminPath(diego, "/admin/metricas")).toBe(false)
    expect(canOpenAdminPath(diego, "/admin/finanzas")).toBe(false)
    expect(canOpenAdminPath(diego, "/admin/office")).toBe(false)
    expect(canOpenAdminPath(diego, "/admin")).toBe(true)
    expect(canOpenAdminPath(accessFor("super_admin", null), "/admin/finanzas")).toBe(true)
    expect(canOpenAdminPath(accessFor("admin", null), "/admin/pases")).toBe(false)
  })

  it("lands staff on their first section", () => {
    expect(adminLandingHref(diego)).toBe("/admin/pases")
    expect(adminLandingHref(accessFor("staff", ["branding", "metrics"]))).toBe("/admin/metricas")
    expect(adminLandingHref(accessFor("staff", []))).toBeNull()
    expect(adminLandingHref(accessFor("super_admin", null))).toBe("/admin/tenants")
  })
})

describe("Producto › Historial", () => {
  it("opens with designs or branding, never with other areas", () => {
    expect(canOpenAdminPath(accessFor("staff", ["designs"]), "/admin/historial")).toBe(true)
    expect(canOpenAdminPath(accessFor("staff", ["branding"]), "/admin/historial")).toBe(true)
    expect(canOpenAdminPath(accessFor("staff", ["metrics", "campaigns"]), "/admin/historial")).toBe(
      false,
    )
    expect(canOpenAdminPath(accessFor("super_admin", null), "/admin/historial")).toBe(true)
  })
})

describe("Equipo Cuik › permissions table", () => {
  it("every permission belongs to exactly one view row", () => {
    for (const p of STAFF_PERMISSIONS) {
      const rows = STAFF_VIEWS.filter((v) => v.levels.some((l) => l.permissions.includes(p)))
      expect(
        rows.map((r) => r.key),
        p,
      ).toHaveLength(1)
    }
  })

  it("reads and sets a view's level without touching the others", () => {
    const designs = STAFF_VIEWS.find((v) => v.key === "designs")
    const tablero = STAFF_VIEWS.find((v) => v.key === "finance_dashboard")
    if (!designs || !tablero) throw new Error("missing views")
    expect(staffViewLevel(designs, ["designs"])).toBe(0)
    expect(staffViewLevel(designs, ["designs", "designs_publish"])).toBe(1)
    expect(staffViewLevel(tablero, ["designs"])).toBe(-1)

    let perms = withStaffViewLevel(["designs", "designs_publish"], tablero, 0)
    expect(perms).toEqual(["designs", "designs_publish", "finance_dashboard"])
    perms = withStaffViewLevel(perms, designs, 0)
    expect(perms).toEqual(["designs", "finance_dashboard"])
    perms = withStaffViewLevel(perms, designs, -1)
    expect(perms).toEqual(["finance_dashboard"])
  })

  it("summarizes a member's access by view and level", () => {
    expect(staffAccessSummary(["designs", "designs_publish", "finance_dashboard"])).toEqual([
      "Loyalty › Diseños de pases: Editar y publicar",
      "Finanzas › Tablero: Ver",
    ])
  })

  it("today's permissions read the same in the table (no migration)", () => {
    expect(staffAccessSummary(normalizeStaffPermissions(["designs_publish"]))).toEqual([
      "Loyalty › Diseños de pases: Editar y publicar",
    ])
  })
})
