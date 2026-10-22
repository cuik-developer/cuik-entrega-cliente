import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearLoyaltyClassCache,
  ensureLoyaltyClass,
  setClassMerchantLocations,
  updateLoyaltyClass,
} from "./loyalty-class"

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch)
  clearLoyaltyClassCache()
})

afterEach(() => {
  vi.restoreAllMocks()
  mockFetch.mockReset()
})

const LIMA = { latitude: -12.1211, longitude: -77.0297 }
const base = {
  accessToken: "token",
  classId: "123.Cafe-Loyalty",
  programName: "Cafe Loyalty",
  issuerName: "Cafe",
  callbackUrl: "https://cuik.org/api/webhooks/google-wallet",
}

function sentBody(call = 0) {
  return JSON.parse(mockFetch.mock.calls[call][1].body as string)
}

describe("setClassMerchantLocations", () => {
  it("PATCHes only the locations with UNDER_REVIEW", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    const result = await setClassMerchantLocations({
      accessToken: "token",
      classId: base.classId,
      merchantLocations: [LIMA],
    })
    expect(result).toEqual({ ok: true })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain(`/loyaltyClass/${base.classId}`)
    expect(init.method).toBe("PATCH")
    expect(sentBody()).toEqual({ merchantLocations: [LIMA], reviewStatus: "UNDER_REVIEW" })
  })

  it("sends an empty list to clear and reports a missing class as 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    const result = await setClassMerchantLocations({
      accessToken: "token",
      classId: base.classId,
      merchantLocations: [],
    })
    expect(sentBody().merchantLocations).toEqual([])
    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it("never sends more than 10 locations", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await setClassMerchantLocations({
      accessToken: "token",
      classId: base.classId,
      merchantLocations: Array.from({ length: 12 }, () => LIMA),
    })
    expect(sentBody().merchantLocations).toHaveLength(10)
  })
})

describe("class payload with merchant locations", () => {
  it("PUT re-sends the locations and omits the key when there are none", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    await updateLoyaltyClass({ ...base, merchantLocations: [LIMA] })
    expect(sentBody(0).merchantLocations).toEqual([LIMA])
    await updateLoyaltyClass({ ...base, merchantLocations: [] })
    expect(sentBody(1)).not.toHaveProperty("merchantLocations")
  })

  it("POST includes the locations when the class is created", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    const result = await ensureLoyaltyClass({ ...base, issuerId: "123", merchantLocations: [LIMA] })
    expect(result).toEqual({ ok: true, classId: base.classId, created: true })
    expect(sentBody(1).merchantLocations).toEqual([LIMA])
  })
})
