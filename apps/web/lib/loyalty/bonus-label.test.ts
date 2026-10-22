import { describe, expect, it } from "vitest"
import { bonusLabel } from "./bonus-label"

describe("bonusLabel", () => {
  it("translates engine codes and keeps window labels", () => {
    expect(bonusLabel("birthday_bonus, Lunes de mañana (×2)")).toBe(
      "Cumpleaños · Lunes de mañana (×2)",
    )
    expect(bonusLabel("2x_multiplier")).toBe("×2")
    expect(bonusLabel("Hora ×3")).toBe("Hora ×3")
  })
})
