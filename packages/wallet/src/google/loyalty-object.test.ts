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

  it("sends no image of its own by default: the class banner is the only one", async () => {
    const designFields = { headerFields: [], secondaryFields: [], backFields: [] }

    for (const overrides of [{}, { designFields }]) {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await upsertLoyaltyObject(baseParams(overrides))

      const body = JSON.parse(mockFetch.mock.calls.at(-1)?.[1].body)
      expect(body.imageModulesData).toBeUndefined()
      expect(body.heroImage).toBeUndefined()
    }
  })

  it("sends the stamp card as the object banner, never as an image module", async () => {
    const stampsImageUrl = "https://app.example.com/api/public/google-stamps/d/abcdefabcdef-3.png"
    const designFields = { headerFields: [], secondaryFields: [], backFields: [] }

    for (const overrides of [{ stampsImageUrl }, { stampsImageUrl, designFields }]) {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await upsertLoyaltyObject(baseParams(overrides))

      const body = JSON.parse(mockFetch.mock.calls.at(-1)?.[1].body)
      expect(body.heroImage).toEqual({ sourceUri: { uri: stampsImageUrl } })
      expect(body.imageModulesData).toBeUndefined()
    }
  })

  it("rejected with the stamp card: sends the pass again without the image", async () => {
    const stampsImageUrl = "https://app.example.com/api/public/google-stamps/d/abcdefabcdef-3.png"
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("Image cannot be loaded"),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 })

    const result = await upsertLoyaltyObject(baseParams({ stampsImageUrl, stampsInCycle: 3 }))

    expect(result.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const first = JSON.parse(mockFetch.mock.calls[0][1].body)
    const second = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(first.heroImage).toEqual({ sourceUri: { uri: stampsImageUrl } })
    expect(second.heroImage).toBeUndefined()
    // Everything else of the visit still travels.
    expect(second.loyaltyPoints).toEqual(first.loyaltyPoints)
    expect(second.id).toBe(first.id)
  })

  it("does not retry what the image cannot explain", async () => {
    const stampsImageUrl = "https://app.example.com/api/public/google-stamps/d/abcdefabcdef-3.png"
    const fail = (status: number) => ({
      ok: false,
      status,
      text: vi.fn().mockResolvedValue("nope"),
    })

    // Invalid pass without an image: nothing to drop.
    mockFetch.mockResolvedValueOnce(fail(400))
    expect((await upsertLoyaltyObject(baseParams())).ok).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Google down or refusing us: the image is not the cause.
    for (const status of [401, 403, 429, 500]) {
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(fail(status))
      expect((await upsertLoyaltyObject(baseParams({ stampsImageUrl }))).ok).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    }
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
