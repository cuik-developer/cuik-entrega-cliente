import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { UpsertLoyaltyObjectParams } from "../shared/types"
import { upsertLoyaltyObject } from "./loyalty-object"

// ─── Mock fetch ──────────────────────────────────────────────────────

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Helpers ────────────────────────────────────────────────────────

function baseParams(overrides: Partial<UpsertLoyaltyObjectParams> = {}): UpsertLoyaltyObjectParams {
  return {
    issuerId: "123456",
    classId: "123456.CafeLoyalty",
    serialNumber: "cuik:cafe:a1b2c3d4e5f6",
    clientName: "Juan Perez",
    stampsInCycle: 3,
    maxVisits: 8,
    totalVisits: 11,
    hasReward: false,
    rewardRedeemed: false,
    qrValue: "cuik:cafe:a1b2c3d4e5f6",
    accessToken: "mock-access-token",
    ...overrides,
  }
}

// ─── Upsert Logic ────────────────────────────────────────────────────

describe("upsertLoyaltyObject", () => {
  it("returns ok on successful PUT (update)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const result = await upsertLoyaltyObject(baseParams())
    expect(result).toEqual({ ok: true, objectId: "123456.cuik-cafe-a1b2c3d4e5f6" })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][1].method).toBe("PUT")
  })

  it("falls back to POST on 404 PUT", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: vi.fn().mockResolvedValue("") })
      .mockResolvedValueOnce({ ok: true, status: 200 })

    const result = await upsertLoyaltyObject(baseParams())
    expect(result).toEqual({ ok: true, objectId: "123456.cuik-cafe-a1b2c3d4e5f6" })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[1][1].method).toBe("POST")
  })

  it("returns error when both PUT and POST fail", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: vi.fn().mockResolvedValue("") })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Server error"),
      })

    const result = await upsertLoyaltyObject(baseParams())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
    }
  })

  it("returns error on non-404 PUT failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue("Forbidden"),
    })

    const result = await upsertLoyaltyObject(baseParams())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })
})

// ─── Payload Content ────────────────────────────────────────────────

describe("loyalty object payload", () => {
  it("includes correct balance text for mid-cycle stamps", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams({ stampsInCycle: 3, maxVisits: 8 }))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.loyaltyPoints.balance.string).toBe("3 de 8 visitas | Te faltan 5 para el premio")
  })

  it("includes correct balance text for 0 stamps", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams({ stampsInCycle: 0, maxVisits: 8 }))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.loyaltyPoints.balance.string).toBe("0 de 8 visitas | Te faltan 8 para el premio")
  })

  it("includes correct balance text when reward is available", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams({ stampsInCycle: 8, maxVisits: 8, hasReward: true }))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.loyaltyPoints.balance.string).toBe("8 de 8 visitas | Premio disponible!")
  })

  it("includes correct balance text when reward was redeemed", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams({ stampsInCycle: 0, maxVisits: 8, rewardRedeemed: true }))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.loyaltyPoints.balance.string).toBe(
      "Premio canjeado | Te faltan 8 visitas para el proximo premio",
    )
  })

  it("builds correct objectId from issuerId and serialNumber", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams())

    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain("123456.cuik-cafe-a1b2c3d4e5f6")
  })

  it("includes totalVisits in textModulesData", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams({ totalVisits: 42 }))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const totalModule = body.textModulesData.find((m: { id: string }) => m.id === "total_visits")
    expect(totalModule.body).toBe("42")
  })

  it("includes QR barcode with correct value", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await upsertLoyaltyObject(baseParams())

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.barcode.type).toBe("QR_CODE")
    expect(body.barcode.value).toBe("cuik:cafe:a1b2c3d4e5f6")
  })
})
