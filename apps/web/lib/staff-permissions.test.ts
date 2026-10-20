import { describe, expect, it } from "vitest"
import {
  accessFor,
  adminLandingHref,
  canAccess,
  canOpenAdminPath,
  normalizeStaffPermissions,
  permissionForAdminPath,
} from "./staff-permissions"

describe("normalizeStaffPermissions", () => {
  it("keeps known keys once, in canonical order", () => {
    expect(normalizeStaffPermissions(["metrics", "designs", "designs", "hack", 3])).toEqual([
      "designs",
      "metrics",
    ])
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
    expect(permissionForAdminPath("/admin/finanzas/tablero")).toBeNull()
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
