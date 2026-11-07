import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({}))

import { accessFor } from "@/lib/staff-permissions"
import { historyAreasFor } from "./product-changes"

describe("historyAreasFor", () => {
  it("shows each Equipo Cuik member only the areas they hold", () => {
    expect(historyAreasFor(accessFor("super_admin", null))).toEqual(["designs", "branding"])
    expect(historyAreasFor(accessFor("staff", ["designs_publish"]))).toEqual(["designs"])
    expect(historyAreasFor(accessFor("staff", ["branding", "metrics"]))).toEqual(["branding"])
    expect(historyAreasFor(accessFor("staff", ["metrics"]))).toEqual([])
    expect(historyAreasFor({ kind: "none" })).toEqual([])
  })
})
