import { describe, expect, it } from "vitest"

import { getDefaultConfigV2 } from "./defaults"
import { googleBalanceText } from "./preview-values"
import { normalizeHex, prepareForSave, uniqueFieldKey } from "./validate-config"

describe("normalizeHex", () => {
  it("expands short hex and adds the hash", () => {
    expect(normalizeHex("#fff")).toBe("#FFFFFF")
    expect(normalizeHex("1e3a5f")).toBe("#1e3a5f")
    expect(normalizeHex("#1E3A5F")).toBe("#1E3A5F")
    expect(normalizeHex("#12")).toBe("#12")
  })
})

describe("prepareForSave", () => {
  it("fills empty keys with unique ones and normalises colours", () => {
    const cfg = getDefaultConfigV2("X")
    cfg.colors.backgroundColor = "#abc"
    cfg.fields.backFields.push({ key: "", label: "Visitas totales", value: "1" })
    const { config, errors } = prepareForSave(cfg)
    expect(errors).toEqual([])
    expect(config.colors.backgroundColor).toBe("#AABBCC")
    expect(config.fields.backFields.at(-1)?.key).toBe("visitas_totales")
  })

  it("blocks invalid colours and duplicate keys across sections", () => {
    const cfg = getDefaultConfigV2("X")
    cfg.colors.labelColor = "#12"
    cfg.fields.backFields.push({ key: "total", label: "Otra", value: "1" })
    const { errors } = prepareForSave(cfg)
    expect(errors.some((e) => e.includes("Color de labels"))).toBe(true)
    expect(errors.some((e) => e.includes('"total"'))).toBe(true)
  })
})

describe("uniqueFieldKey", () => {
  it("never returns a used or empty key", () => {
    expect(uniqueFieldKey("", [])).toBe("campo")
    expect(uniqueFieldKey("Campo", ["campo", "campo_2"])).toBe("campo_3")
  })
})

describe("googleBalanceText (mirrors loyalty-object.ts buildBalanceText)", () => {
  const base = { promotionType: "stamps" as const, maxVisits: 8, tenantName: "T" }
  it("in progress", () => {
    expect(googleBalanceText({ ...base, current: 3, completed: false })).toBe(
      "3 de 8 visitas | Te faltan 5 para el premio",
    )
  })
  it("card complete with a pending reward", () => {
    expect(googleBalanceText({ ...base, current: 0, completed: true })).toBe(
      "8 de 8 visitas | Premio disponible!",
    )
  })
})
