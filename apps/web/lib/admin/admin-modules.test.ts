import { describe, expect, it } from "vitest"
import { accessFor } from "@/lib/staff-permissions"
import { ADMIN_MODULES, moduleForPath, visibleModules } from "./admin-modules"

describe("moduleForPath", () => {
  it("puts every screen in its module, most specific href first", () => {
    expect(moduleForPath("/admin/tenants/abc")?.module.key).toBe("comercios")
    expect(moduleForPath("/admin/pases/123/editor")?.module.key).toBe("loyalty")
    expect(moduleForPath("/admin/campanas")?.item.label).toBe("Validación de campañas")
    expect(moduleForPath("/admin/historial")?.module.key).toBe("comercios")
    expect(moduleForPath("/admin/enlaces")?.module.key).toBe("comercios")
    expect(moduleForPath("/admin/impacto")?.module.key).toBe("loyalty")
    expect(moduleForPath("/admin/growth")?.module.key).toBe("growth")
    expect(moduleForPath("/admin/growth/reglas")?.item.label).toBe("Reglas por comercio")
    expect(moduleForPath("/admin/growth/conectores")?.module.key).toBe("growth")
    expect(moduleForPath("/admin/finanzas/prospectos")?.module.key).toBe("crm")
    expect(moduleForPath("/admin/finanzas/tablero")?.item.label).toBe("Tablero")
    expect(moduleForPath("/admin/finanzas")?.module.key).toBe("finanzas")
    expect(moduleForPath("/admin/planes")?.module.key).toBe("finanzas")
    expect(moduleForPath("/admin/finanzas/empresa")?.item.label).toBe("Empresa y régimen")
    expect(moduleForPath("/admin/finanzas/ventas")?.item.label).toBe("Ventas")
    expect(moduleForPath("/admin/finanzas/contabilidad")?.item.label).toBe("Resumen fiscal")
    expect(moduleForPath("/admin/finanzas/compras")?.item.label).toBe("Compras")
    expect(moduleForPath("/admin/finanzas/cierres")?.item.label).toBe("Cierres")
    expect(moduleForPath("/admin/finanzas/cobranza")?.item.label).toBe("Cobranza")
    expect(moduleForPath("/admin/finanzas/inicio")?.item.label).toBe("Inicio")
    expect(moduleForPath("/admin/reclamaciones")?.module.key).toBe("reclamaciones")
    expect(moduleForPath("/admin/equipo")?.module.key).toBe("sistema")
    expect(moduleForPath("/admin")).toBeNull()
    expect(moduleForPath("/admin/pasesx")).toBeNull()
  })

  it("lists each screen once across modules", () => {
    const hrefs = ADMIN_MODULES.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.href)))
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("visibleModules", () => {
  it("shows the owner every module", () => {
    expect(visibleModules(accessFor("super_admin", null)).map((m) => m.module.key)).toEqual([
      "comercios",
      "loyalty",
      "growth",
      "crm",
      "reclamaciones",
      "finanzas",
      "sistema",
    ])
  })

  it("shows Equipo Cuik only the modules and screens they hold", () => {
    const diego = visibleModules(
      accessFor("staff", ["designs", "branding", "campaigns", "tenants_view", "metrics"]),
    )
    expect(diego.map((m) => m.module.key)).toEqual(["comercios", "loyalty"])
    const labels = diego.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.label)))
    expect(labels).not.toContain("Exportar datos")
    expect(labels).not.toContain("Validación de enlaces")
    expect(diego[0].href).toBe("/admin/tenants")

    const brandingOnly = visibleModules(accessFor("staff", ["branding"]))
    expect(brandingOnly[0].href).toBe("/admin/historial")
    expect(visibleModules(accessFor("staff", []))).toEqual([])
  })
})
