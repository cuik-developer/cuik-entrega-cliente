import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockState } = vi.hoisted(() => {
  const mockState = {
    selectResults: [] as unknown[],
    selectIdx: 0,
    reset() {
      mockState.selectResults = []
      mockState.selectIdx = 0
    },
    pushSelectResult(result: unknown) {
      mockState.selectResults.push(result)
    },
    nextResult() {
      const result = mockState.selectResults[mockState.selectIdx] ?? []
      mockState.selectIdx++
      return result
    },
  }
  return { mockState }
})

vi.mock("@cuik/db", () => {
  const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    _tag: "sql",
  })
  sqlTag.join = vi.fn()

  // Each select() call gets its own chain that resolves the next queued result
  const makeSelectChain = () => {
    let resolved = false
    let resolvedValue: unknown

    const getResult = () => {
      if (!resolved) {
        resolvedValue = mockState.nextResult()
        resolved = true
      }
      return resolvedValue
    }

    // Make a thenable chain object
    const makeThenableChain = (): Record<string, unknown> => {
      const chain: Record<string, unknown> = {}

      // Support .limit() — just returns the same result
      chain.limit = vi.fn().mockImplementation(() => getResult())

      // Support .where() — returns another thenable chain
      chain.where = vi.fn().mockImplementation(() => makeThenableChain())

      // Support .orderBy() — returns another thenable chain
      chain.orderBy = vi.fn().mockImplementation(() => makeThenableChain())

      // Make it thenable so `await db.select().from().where()` works
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Drizzle query chain
      chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          resolve(getResult())
        } catch (e) {
          reject?.(e)
        }
      }

      return chain
    }

    return {
      from: vi.fn().mockImplementation(() => makeThenableChain()),
    }
  }

  return {
    db: {
      select: vi.fn().mockImplementation(makeSelectChain),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      })),
    },
    sql: sqlTag,
    tenants: {
      id: "id",
      businessType: "businessType",
      segmentationConfig: "segmentationConfig",
      name: "name",
    },
    campaigns: { id: "id", tenantId: "tenantId", status: "status" },
    campaignSegments: { campaignId: "campaignId", filter: "filter" },
    passInstances: {
      clientId: "clientId",
      serialNumber: "serialNumber",
      googleObjectId: "googleObjectId",
    },
    appleDevices: {
      serialNumber: "serialNumber",
      pushToken: "pushToken",
    },
    notifications: {},
    eq: vi.fn((a, b) => ({ type: "eq", left: a, right: b })),
    and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  }
})

vi.mock("@cuik/wallet/apple", () => ({
  sendApnsPush: vi.fn(),
}))

vi.mock("@cuik/wallet/google", () => ({
  getGoogleAccessToken: vi.fn(),
  upsertLoyaltyObject: vi.fn(),
  buildGoogleClassId: vi.fn(() => "issuer.cuik_loyalty"),
}))

vi.mock("@/lib/wallet/tenant-apple-config", () => ({
  getTenantAppleConfig: vi.fn(),
}))

vi.mock("@/lib/loyalty/client-segments", () => ({
  getThresholds: vi.fn(() => ({
    vipMinVisits: 10,
    frequentMinVisits: 5,
    atRiskDaysInactive: 30,
    lostDaysInactive: 90,
  })),
}))

vi.mock("./resolve-segment", () => ({
  resolveSegment: vi.fn(),
}))

import { sendApnsPush } from "@cuik/wallet/apple"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"
import { executeCampaign } from "./execute-campaign"
import { resolveSegment } from "./resolve-segment"

const mockResolveSegment = vi.mocked(resolveSegment)
const mockSendApnsPush = vi.mocked(sendApnsPush)
const mockGetTenantAppleConfig = vi.mocked(getTenantAppleConfig)

const DRAFT_CAMPAIGN = {
  id: "campaign-1",
  tenantId: "tenant-1",
  status: "draft",
  message: "Hello customers!",
  name: "Test Campaign",
}

describe("executeCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.reset()
  })

  it("returns failed when campaign is not found", async () => {
    mockState.pushSelectResult([])

    const result = await executeCampaign("non-existent")

    expect(result.status).toBe("failed")
    expect(result.errors).toContain("Campaign not found")
  })

  it("returns failed when campaign status is 'sent' (already sent)", async () => {
    mockState.pushSelectResult([{ ...DRAFT_CAMPAIGN, status: "sent" }])

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("failed")
    expect(result.errors[0]).toContain("sent")
    expect(result.errors[0]).toContain("expected 'draft' or 'scheduled'")
  })

  it("returns 'sent' with zero counts for empty segment", async () => {
    mockState.pushSelectResult([DRAFT_CAMPAIGN])
    mockState.pushSelectResult([{ filter: { preset: "todos" } }])
    // 4b. Tenant data for segmentation thresholds
    mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
    mockResolveSegment.mockResolvedValueOnce({ clientIds: [], count: 0 })

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("sent")
    expect(result.targetCount).toBe(0)
    expect(result.sentCount).toBe(0)
    expect(result.failedCount).toBe(0)
  })

  it("executes full flow with Apple push", async () => {
    // 1. Load campaign
    mockState.pushSelectResult([DRAFT_CAMPAIGN])
    // 2. Load segment
    mockState.pushSelectResult([{ filter: { preset: "todos" } }])
    // 4b. Tenant data for segmentation thresholds
    mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
    // 3. getClientPassInfo: pass instances
    mockState.pushSelectResult([
      { clientId: "client-1", serialNumber: "serial-1", googleObjectId: null },
    ])
    // 4. getClientPassInfo: apple devices
    mockState.pushSelectResult([{ serialNumber: "serial-1", pushToken: "device-token-1" }])

    mockResolveSegment.mockResolvedValueOnce({
      clientIds: ["client-1"],
      count: 1,
    })

    process.env.APPLE_APNS_P8_BASE64 = Buffer.from("fake-key").toString("base64")
    process.env.APPLE_APNS_TEAM_ID = "TEAM123"
    process.env.APPLE_APNS_KEY_ID = "KEY123"

    mockGetTenantAppleConfig.mockResolvedValueOnce({
      passTypeId: "pass.com.cuik",
      teamId: "TEAM123",
      signerCertBase64: "",
      signerKeyBase64: "",
      wwdrBase64: "",
      authSecret: "test-secret",
      webServiceUrl: "https://example.com",
    })

    mockSendApnsPush.mockResolvedValueOnce({
      sent: 1,
      total: 1,
      results: [{ ok: true, tokenPrefix: "device-t", status: 200, envUsed: "sandbox" as const }],
    })

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("sent")
    expect(result.sentCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(mockSendApnsPush).toHaveBeenCalledTimes(1)

    delete process.env.APPLE_APNS_P8_BASE64
    delete process.env.APPLE_APNS_TEAM_ID
    delete process.env.APPLE_APNS_KEY_ID
  })

  it("handles partial failures gracefully", async () => {
    mockState.pushSelectResult([DRAFT_CAMPAIGN])
    mockState.pushSelectResult([{ filter: { preset: "todos" } }])
    // 4b. Tenant data for segmentation thresholds
    mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
    mockState.pushSelectResult([
      { clientId: "client-1", serialNumber: "serial-1", googleObjectId: null },
      { clientId: "client-2", serialNumber: "serial-2", googleObjectId: null },
    ])
    mockState.pushSelectResult([
      { serialNumber: "serial-1", pushToken: "token-1" },
      { serialNumber: "serial-2", pushToken: "token-2" },
    ])

    mockResolveSegment.mockResolvedValueOnce({
      clientIds: ["client-1", "client-2"],
      count: 2,
    })

    process.env.APPLE_APNS_P8_BASE64 = Buffer.from("fake-key").toString("base64")
    process.env.APPLE_APNS_TEAM_ID = "TEAM123"
    process.env.APPLE_APNS_KEY_ID = "KEY123"

    mockGetTenantAppleConfig.mockResolvedValueOnce({
      passTypeId: "pass.com.cuik",
      teamId: "TEAM123",
      signerCertBase64: "",
      signerKeyBase64: "",
      wwdrBase64: "",
      authSecret: "test-secret",
      webServiceUrl: "https://example.com",
    })

    mockSendApnsPush
      .mockResolvedValueOnce({
        sent: 1,
        total: 1,
        results: [{ ok: true, tokenPrefix: "token-1x", status: 200, envUsed: "sandbox" as const }],
      })
      .mockResolvedValueOnce({
        sent: 0,
        total: 1,
        results: [
          {
            ok: false,
            tokenPrefix: "token-2x",
            status: 400,
            envUsed: "sandbox" as const,
            error: "DeviceTokenNotForTopic",
          },
        ],
      })

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("sent")
    expect(result.sentCount).toBe(1)
    expect(result.failedCount).toBe(1)

    delete process.env.APPLE_APNS_P8_BASE64
    delete process.env.APPLE_APNS_TEAM_ID
    delete process.env.APPLE_APNS_KEY_ID
  })

  it("accepts campaign with 'scheduled' status", async () => {
    mockState.pushSelectResult([{ ...DRAFT_CAMPAIGN, status: "scheduled" }])
    mockState.pushSelectResult([{ filter: { preset: "todos" } }])
    // 4b. Tenant data for segmentation thresholds
    mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
    mockResolveSegment.mockResolvedValueOnce({ clientIds: [], count: 0 })

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("sent")
    expect(result.errors).toEqual([])
  })

  it("rejects campaign with 'sending' status", async () => {
    mockState.pushSelectResult([{ ...DRAFT_CAMPAIGN, status: "sending" }])

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("failed")
    expect(result.errors[0]).toContain("sending")
  })
})
