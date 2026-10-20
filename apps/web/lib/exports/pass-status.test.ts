import { describe, expect, it, vi } from "vitest"

vi.mock("@cuik/db", () => ({ db: {}, sql: () => ({}) }))

const { passStatus } = await import("./build-dataset")

const d = (s: string) => new Date(`${s}T12:00:00Z`)
const base = {
  hasPass: true,
  appleInstalled: false,
  googleUrl: false,
  googleSavedAt: null,
  googleDeletedAt: null,
  appleRemovedAt: null,
}

describe("passStatus", () => {
  it("no pass", () => {
    expect(passStatus({ ...base, hasPass: false }).status).toBe("Sin pase")
  })

  it("Apple installed wins over any removal", () => {
    const r = passStatus({ ...base, appleInstalled: true, appleRemovedAt: d("2026-10-20") })
    expect(r).toEqual({ status: "Instalado", platform: "Apple Wallet", removedAt: null })
  })

  it("Apple removed (no device, removal recorded)", () => {
    const r = passStatus({ ...base, appleRemovedAt: d("2026-10-20") })
    expect(r).toEqual({
      status: "Eliminado",
      platform: "Apple Wallet",
      removedAt: d("2026-10-20"),
    })
  })

  it("a Google save confirmed by callback beats an Apple removal", () => {
    const r = passStatus({
      ...base,
      googleUrl: true,
      googleSavedAt: d("2026-10-01"),
      appleRemovedAt: d("2026-10-20"),
    })
    expect(r.status).toBe("Instalado")
    expect(r.platform).toBe("Google Wallet")
  })

  it("the bare Google link (every client has one) does not hide an Apple removal", () => {
    const r = passStatus({ ...base, googleUrl: true, appleRemovedAt: d("2026-10-20") })
    expect(r).toEqual({
      status: "Eliminado",
      platform: "Apple Wallet",
      removedAt: d("2026-10-20"),
    })
  })

  it("the bare Google link still counts as installed without an Apple removal", () => {
    expect(passStatus({ ...base, googleUrl: true }).status).toBe("Instalado")
  })

  it("both removed: the most recent removal wins", () => {
    const both = {
      ...base,
      googleUrl: true,
      googleSavedAt: d("2026-10-01"),
      googleDeletedAt: d("2026-10-21"),
      appleRemovedAt: d("2026-10-20"),
    }
    expect(passStatus(both).platform).toBe("Google Wallet")
    expect(passStatus(both).removedAt).toEqual(d("2026-10-21"))
    const appleLater = { ...both, appleRemovedAt: d("2026-10-22") }
    expect(passStatus(appleLater).platform).toBe("Apple Wallet")
    expect(passStatus(appleLater).removedAt).toEqual(d("2026-10-22"))
  })

  it("Google removed only", () => {
    const r = passStatus({ ...base, googleUrl: true, googleDeletedAt: d("2026-10-05") })
    expect(r).toEqual({
      status: "Eliminado",
      platform: "Google Wallet",
      removedAt: d("2026-10-05"),
    })
  })

  it("Apple pass never registered and no removal stays No instalado", () => {
    expect(passStatus(base)).toEqual({
      status: "No instalado",
      platform: "Sin Wallet",
      removedAt: null,
    })
    const { appleRemovedAt: _, ...legacy } = base
    expect(passStatus(legacy).status).toBe("No instalado")
  })
})
