import { describe, expect, it } from "vitest"
import { requiresTwoFactor, twoFactorPending } from "./two-factor"

describe("two-factor policy", () => {
  it("is mandatory for the Cuik team only", () => {
    expect(requiresTwoFactor("super_admin")).toBe(true)
    expect(requiresTwoFactor("staff")).toBe(true)
    expect(requiresTwoFactor("admin")).toBe(false)
    expect(requiresTwoFactor("user")).toBe(false)
    expect(requiresTwoFactor(null)).toBe(false)
  })

  it("flags a team member who has not turned it on yet", () => {
    expect(twoFactorPending({ role: "super_admin", twoFactorEnabled: false })).toBe(true)
    expect(twoFactorPending({ role: "staff", twoFactorEnabled: null })).toBe(true)
    expect(twoFactorPending({ role: "staff", twoFactorEnabled: true })).toBe(false)
    expect(twoFactorPending({ role: "admin", twoFactorEnabled: false })).toBe(false)
  })
})
