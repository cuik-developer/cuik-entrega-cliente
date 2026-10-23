import { describe, expect, it } from "vitest"

import { visitBonusKind, visitOriginLabel } from "./visit-origin"

describe("visitBonusKind", () => {
  it("is null without a bonus", () => {
    expect(visitBonusKind([])).toBeNull()
  })
  it("recognizes the birthday bonus in stamps and points", () => {
    expect(visitBonusKind(["birthday_bonus"])).toBe("birthday")
    expect(visitBonusKind(["birthday_multiplier"])).toBe("birthday")
  })
  it("treats hour windows and legacy multipliers as hora especial", () => {
    expect(visitBonusKind(["Lunes de mañana (×2)"])).toBe("special_hour")
    expect(visitBonusKind(["Hora ×3"])).toBe("special_hour")
    expect(visitBonusKind(["double_stamps_day"])).toBe("special_hour")
    expect(visitBonusKind(["2x_multiplier"])).toBe("special_hour")
  })
})

describe("visitOriginLabel", () => {
  it("labels the five origins", () => {
    expect(visitOriginLabel("bonus", null)).toBe("Bono de registro")
    expect(visitOriginLabel("qr", "birthday")).toBe("Bono de cumpleaños")
    expect(visitOriginLabel("manual", "special_hour")).toBe("Bono hora especial")
    expect(visitOriginLabel("qr", null)).toBe("QR")
    expect(visitOriginLabel("manual", null)).toBe("Manual")
  })
})
