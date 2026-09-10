import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({
  db: {},
  and: vi.fn(),
  eq: vi.fn(),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
  clients: {},
  campaigns: {},
  campaignSegments: {},
}))
vi.mock("./execute-campaign", () => ({ executeCampaign: vi.fn() }))

import { getBirthdayConfig, hourLocal, todayLocal } from "./birthday"

describe("getBirthdayConfig", () => {
  it("fills defaults when nothing is stored", () => {
    const c = getBirthdayConfig(null)
    expect(c.enabled).toBe(false)
    expect(c.sendHour).toBe(10)
    expect(c.message).toContain("{{client.name}}")
  })

  it("keeps stored values and ignores garbage", () => {
    expect(
      getBirthdayConfig({ birthday: { enabled: true, message: "Hola", sendHour: 9 } }),
    ).toEqual({
      enabled: true,
      message: "Hola",
      sendHour: 9,
    })
    expect(getBirthdayConfig({ birthday: { enabled: "yes" } }).enabled).toBe(false)
  })
})

describe("tenant-local clock", () => {
  const t = new Date("2026-09-10T03:30:00.000Z") // 22:30 of Sep 9 in Lima

  it("todayLocal follows the tenant timezone, not UTC", () => {
    expect(todayLocal("America/Lima", t)).toBe("2026-09-09")
    expect(todayLocal("UTC", t)).toBe("2026-09-10")
  })

  it("hourLocal is 0-23 in the tenant timezone", () => {
    expect(hourLocal("America/Lima", t)).toBe(22)
    expect(hourLocal("UTC", t)).toBe(3)
    expect(hourLocal("America/Lima", new Date("2026-09-10T05:10:00.000Z"))).toBe(0)
  })
})
