import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApnsPushResult, UpsertResult, WalletUpdateParams } from "./types"

// ─── Mock dependencies ──────────────────────────────────────────────

const mockSendApnsPush = vi.fn<[], Promise<ApnsPushResult>>()
const mockUpsertLoyaltyObject = vi.fn<[], Promise<UpsertResult>>()

vi.mock("../apple/apns", () => ({
  sendApnsPush: (...args: unknown[]) => mockSendApnsPush(...(args as [])),
}))

vi.mock("../google/loyalty-object", () => ({
  upsertLoyaltyObject: (...args: unknown[]) => mockUpsertLoyaltyObject(...(args as [])),
}))

import { updateWalletAfterVisit } from "./update-after-visit"

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})

  mockSendApnsPush.mockResolvedValue({
    sent: 1,
    total: 1,
    results: [{ tokenPrefix: "abcd1234", ok: true, status: 200, envUsed: "production" }],
  })

  mockUpsertLoyaltyObject.mockResolvedValue({
    ok: true,
    objectId: "123456.cuik:cafe:abc123",
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  mockSendApnsPush.mockReset()
  mockUpsertLoyaltyObject.mockReset()
})

// ─── Helpers ────────────────────────────────────────────────────────

function baseParams(overrides: Partial<WalletUpdateParams> = {}): WalletUpdateParams {
  return {
    clientId: "client-1",
    tenantId: "tenant-1",
    serialNumber: "cuik:cafe:abc123",
    stampsInCycle: 3,
    maxVisits: 8,
    totalVisits: 11,
    hasReward: false,
    rewardRedeemed: false,
    clientName: "Juan Perez",
    apple: {
      deviceTokens: ["token-abc"],
      passTypeId: "pass.app.cuik.test",
      p8KeyPem: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
      teamId: "TEAM123",
      keyId: "KEY123",
    },
    google: {
      issuerId: "123456",
      classId: "123456.CafeLoyalty",
      accessToken: "mock-token",
      qrValue: "cuik:cafe:abc123",
    },
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("updateWalletAfterVisit", () => {
  it("calls APNs when apple config is provided", async () => {
    const result = await updateWalletAfterVisit(baseParams())
    expect(mockSendApnsPush).toHaveBeenCalledTimes(1)
    expect(result.apple).toHaveProperty("sent")
  })

  it("calls Google upsert when google config is provided", async () => {
    const result = await updateWalletAfterVisit(baseParams())
    expect(mockUpsertLoyaltyObject).toHaveBeenCalledTimes(1)
    expect(result.google).toHaveProperty("ok", true)
  })

  it("skips Apple when apple config is null", async () => {
    const result = await updateWalletAfterVisit(baseParams({ apple: null }))
    expect(mockSendApnsPush).not.toHaveBeenCalled()
    expect(result.apple).toEqual({
      skipped: true,
      reason: "Apple config not provided",
    })
  })

  it("skips Google when google config is null", async () => {
    const result = await updateWalletAfterVisit(baseParams({ google: null }))
    expect(mockUpsertLoyaltyObject).not.toHaveBeenCalled()
    expect(result.google).toEqual({
      skipped: true,
      reason: "Google config not provided",
    })
  })

  it("skips both when both configs are null", async () => {
    const result = await updateWalletAfterVisit(baseParams({ apple: null, google: null }))
    expect(result.apple).toHaveProperty("skipped", true)
    expect(result.google).toHaveProperty("skipped", true)
  })

  it("skips Apple when deviceTokens array is empty", async () => {
    const result = await updateWalletAfterVisit(
      baseParams({
        apple: {
          deviceTokens: [],
          passTypeId: "pass.app.cuik.test",
          p8KeyPem: "fake",
          teamId: "TEAM123",
          keyId: "KEY123",
        },
      }),
    )
    expect(mockSendApnsPush).not.toHaveBeenCalled()
    expect(result.apple).toEqual({
      skipped: true,
      reason: "No registered Apple devices",
    })
  })

  it("catches APNs errors without throwing", async () => {
    mockSendApnsPush.mockRejectedValueOnce(new Error("APNs connection failed"))

    const result = await updateWalletAfterVisit(baseParams())
    expect(result.apple).toEqual({
      skipped: true,
      reason: "APNs error: APNs connection failed",
    })
  })

  it("catches Google upsert errors without throwing", async () => {
    mockUpsertLoyaltyObject.mockRejectedValueOnce(new Error("Google API down"))

    const result = await updateWalletAfterVisit(baseParams())
    expect(result.google).toEqual({
      skipped: true,
      reason: "Google upsert error: Google API down",
    })
  })

  it("never throws even if both platforms fail", async () => {
    mockSendApnsPush.mockRejectedValueOnce(new Error("Apple error"))
    mockUpsertLoyaltyObject.mockRejectedValueOnce(new Error("Google error"))

    await expect(updateWalletAfterVisit(baseParams())).resolves.toBeDefined()
  })
})
