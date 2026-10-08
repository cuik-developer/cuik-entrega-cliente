import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockState } = vi.hoisted(() => {
  const mockState = {
    selectResults: [] as unknown[],
    selectIdx: 0,
    /** Rows the atomic claim UPDATE ... RETURNING yields (empty = someone else owns it). */
    claimRows: [{ id: "campaign-1" }] as unknown[],
    updates: [] as unknown[],
    reset() {
      mockState.selectResults = []
      mockState.selectIdx = 0
      mockState.claimRows = [{ id: "campaign-1" }]
      mockState.updates = []
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
        set: vi.fn().mockImplementation((values: unknown) => {
          mockState.updates.push(values)
          return {
            where: vi.fn().mockImplementation(() => {
              const chain = {
                returning: vi.fn().mockResolvedValue(mockState.claimRows),
                // biome-ignore lint/suspicious/noThenProperty: thenable mock for awaited updates
                then: (resolve: (v: unknown) => void) => resolve(undefined),
              }
              return chain
            }),
          }
        }),
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
  addLoyaltyObjectMessage: vi.fn(),
}))

vi.mock("@cuik/wallet/shared", () => ({
  resolveTemplate: (template: string, ctx: { client: { name: string } }) =>
    template.replaceAll("{{client.name}}", ctx.client.name),
  // Mirrors the real validator: issuer id + base64 service account, same vars as the rest of the app
  validateGoogleEnv: () => {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID
    const b64 = process.env.GOOGLE_WALLET_SA_JSON_B64
    if (!issuerId || !b64) return null
    const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"))
    return {
      issuerId,
      serviceAccountJson: { client_email: sa.client_email, private_key: sa.private_key },
    }
  },
}))

vi.mock("./client-template-context", () => ({
  buildClientTemplateContexts: vi.fn(),
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
import { addLoyaltyObjectMessage, getGoogleAccessToken } from "@cuik/wallet/google"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"
import { buildClientTemplateContexts } from "./client-template-context"
import { executeCampaign } from "./execute-campaign"
import { resolveSegment } from "./resolve-segment"

const mockResolveSegment = vi.mocked(resolveSegment)
const mockAddMessage = vi.mocked(addLoyaltyObjectMessage)
const mockGetGoogleAccessToken = vi.mocked(getGoogleAccessToken)
const mockBuildContexts = vi.mocked(buildClientTemplateContexts)
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

  describe("Google Wallet", () => {
    const withGoogleEnv = () => {
      process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000012345678"
      process.env.GOOGLE_WALLET_SA_JSON_B64 = Buffer.from(
        JSON.stringify({
          client_email: "sa@example.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
        }),
      ).toString("base64")
    }
    const clearGoogleEnv = () => {
      delete process.env.GOOGLE_WALLET_ISSUER_ID
      delete process.env.GOOGLE_WALLET_SA_JSON_B64
    }

    const queueGoogleFlow = (message: string, type = "push") => {
      mockState.pushSelectResult([{ ...DRAFT_CAMPAIGN, message, type }])
      mockState.pushSelectResult([{ filter: { preset: "todos" } }])
      mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
      // getClientPassInfo: pass instances (Android only: no Apple device rows)
      mockState.pushSelectResult([
        {
          clientId: "client-1",
          serialNumber: "cuik:dfrios:abc",
          googleObjectId: "3388000000012345678.cuik-dfrios-abc",
        },
      ])
      mockState.pushSelectResult([])
      // processGoogleBatches: tenant name for the message header
      mockState.pushSelectResult([{ name: "D'frios" }])
      mockResolveSegment.mockResolvedValueOnce({ clientIds: ["client-1"], count: 1 })
      mockGetGoogleAccessToken.mockResolvedValueOnce("google-token")
      mockBuildContexts.mockResolvedValueOnce(new Map([["client-1", { client: { name: "Vito" } }]]))
    }

    it("sends the resolved message through addMessage with the business as header", async () => {
      withGoogleEnv()
      queueGoogleFlow("Hola {{client.name}}, tus puntos vencen el miércoles")
      mockAddMessage.mockResolvedValueOnce({
        ok: true,
        objectId: "3388000000012345678.cuik-dfrios-abc",
        notified: true,
      })

      const result = await executeCampaign("campaign-1")

      expect(result.status).toBe("sent")
      expect(result.sentCount).toBe(1)
      expect(result.failedCount).toBe(0)
      expect(mockAddMessage).toHaveBeenCalledTimes(1)
      expect(mockAddMessage).toHaveBeenCalledWith({
        objectId: "3388000000012345678.cuik-dfrios-abc",
        header: "D'frios",
        body: "Hola Vito, tus puntos vencen el miércoles",
        messageId: "campaign-1",
        accessToken: "google-token",
      })
      clearGoogleEnv()
    })

    it("counts the client as failed when Google only kept the text (quota exhausted)", async () => {
      withGoogleEnv()
      queueGoogleFlow("Promo del viernes")
      mockAddMessage.mockResolvedValueOnce({
        ok: true,
        objectId: "3388000000012345678.cuik-dfrios-abc",
        notified: false,
      })

      const result = await executeCampaign("campaign-1")

      expect(result.sentCount).toBe(0)
      expect(result.failedCount).toBe(1)
      clearGoogleEnv()
    })

    it("skips Google entirely for silent wallet_update campaigns", async () => {
      withGoogleEnv()
      queueGoogleFlow("", "wallet_update")

      const result = await executeCampaign("campaign-1")

      expect(result.status).toBe("sent")
      expect(result.sentCount).toBe(0)
      expect(mockAddMessage).not.toHaveBeenCalled()
      clearGoogleEnv()
    })

    it("does not send through Google to a client whose iPhone installed the pass", async () => {
      withGoogleEnv()
      mockState.pushSelectResult([{ ...DRAFT_CAMPAIGN, message: "Promo", type: "push" }])
      mockState.pushSelectResult([{ filter: { preset: "todos" } }])
      mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
      // Every client has a Google object (created at registration)...
      mockState.pushSelectResult([
        { clientId: "client-1", serialNumber: "serial-1", googleObjectId: "issuer.serial-1" },
        { clientId: "client-2", serialNumber: "serial-2", googleObjectId: "issuer.serial-2" },
      ])
      // ...but only client-1 registered an iPhone
      mockState.pushSelectResult([{ serialNumber: "serial-1", pushToken: "token-1" }])
      // processGoogleBatches: tenant name
      mockState.pushSelectResult([{ name: "Cafe" }])
      mockResolveSegment.mockResolvedValueOnce({ clientIds: ["client-1", "client-2"], count: 2 })
      mockGetGoogleAccessToken.mockResolvedValueOnce("google-token")
      mockBuildContexts.mockResolvedValueOnce(new Map([["client-2", { client: { name: "Ana" } }]]))

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
        results: [{ ok: true, tokenPrefix: "token-1x", status: 200, envUsed: "sandbox" as const }],
      })
      mockAddMessage.mockResolvedValueOnce({
        ok: true,
        objectId: "issuer.serial-2",
        notified: true,
      })

      const result = await executeCampaign("campaign-1")

      // One Apple push + one Google message: 2 sent, no double count for client-1
      expect(result.sentCount).toBe(2)
      expect(result.failedCount).toBe(0)
      expect(mockSendApnsPush).toHaveBeenCalledTimes(1)
      expect(mockAddMessage).toHaveBeenCalledTimes(1)
      expect(mockAddMessage.mock.calls[0]?.[0].objectId).toBe("issuer.serial-2")

      delete process.env.APPLE_APNS_P8_BASE64
      delete process.env.APPLE_APNS_TEAM_ID
      delete process.env.APPLE_APNS_KEY_ID
      clearGoogleEnv()
    })

    it("skips a pass that Google reported removed from the phone", async () => {
      withGoogleEnv()
      mockState.pushSelectResult([{ ...DRAFT_CAMPAIGN, message: "Promo", type: "push" }])
      mockState.pushSelectResult([{ filter: { preset: "todos" } }])
      mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
      mockState.pushSelectResult([
        {
          clientId: "client-1",
          serialNumber: "serial-1",
          googleObjectId: "issuer.serial-1",
          googleSavedAt: new Date("2026-10-01"),
          googleDeletedAt: new Date("2026-10-05"),
        },
        {
          clientId: "client-2",
          serialNumber: "serial-2",
          googleObjectId: "issuer.serial-2",
          googleSavedAt: new Date("2026-10-05"),
          googleDeletedAt: new Date("2026-10-01"),
        },
      ])
      mockState.pushSelectResult([])
      mockState.pushSelectResult([{ name: "Cafe" }])
      mockResolveSegment.mockResolvedValueOnce({ clientIds: ["client-1", "client-2"], count: 2 })
      mockGetGoogleAccessToken.mockResolvedValueOnce("google-token")
      mockBuildContexts.mockResolvedValueOnce(new Map([["client-2", { client: { name: "Ana" } }]]))
      mockAddMessage.mockResolvedValueOnce({
        ok: true,
        objectId: "issuer.serial-2",
        notified: true,
      })

      const result = await executeCampaign("campaign-1")

      // client-1: "del" newer than "save" → not on the phone, skipped. client-2 re-saved → sent.
      expect(result.sentCount).toBe(1)
      expect(mockAddMessage).toHaveBeenCalledTimes(1)
      expect(mockAddMessage.mock.calls[0]?.[0].objectId).toBe("issuer.serial-2")
      clearGoogleEnv()
    })

    it("records failures when Google credentials are missing", async () => {
      clearGoogleEnv()
      queueGoogleFlow("Promo")

      const result = await executeCampaign("campaign-1")

      expect(result.status).toBe("failed")
      expect(result.failedCount).toBe(1)
      expect(result.errors).toContain("Google credentials not configured")
      expect(mockAddMessage).not.toHaveBeenCalled()
    })
  })

  it("does not send when another process already claimed the campaign", async () => {
    mockState.pushSelectResult([DRAFT_CAMPAIGN])
    mockState.claimRows = []

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("failed")
    expect(result.errors[0]).toContain("already being sent")
    expect(mockResolveSegment).not.toHaveBeenCalled()
    expect(mockSendApnsPush).not.toHaveBeenCalled()
  })

  it("puts an all-failed campaign back in draft with the error instead of marking it sent", async () => {
    mockState.pushSelectResult([DRAFT_CAMPAIGN])
    mockState.pushSelectResult([{ filter: { preset: "todos" } }])
    mockState.pushSelectResult([{ businessType: "restaurant", segmentationConfig: null }])
    mockState.pushSelectResult([
      { clientId: "client-1", serialNumber: "serial-1", googleObjectId: null },
    ])
    mockState.pushSelectResult([{ serialNumber: "serial-1", pushToken: "device-token-1" }])
    mockResolveSegment.mockResolvedValueOnce({ clientIds: ["client-1"], count: 1 })
    // No Apple credentials in env → every push is recorded as failed
    delete process.env.APPLE_APNS_P8_BASE64
    mockGetTenantAppleConfig.mockResolvedValueOnce(null)

    const result = await executeCampaign("campaign-1")

    expect(result.status).toBe("failed")
    expect(result.sentCount).toBe(0)
    expect(result.failedCount).toBe(1)
    const finalUpdate = mockState.updates.at(-1) as {
      status: string
      content?: { lastError?: string }
    }
    expect(finalUpdate.status).toBe("draft")
    expect(finalUpdate.content?.lastError).toContain("Apple credentials not configured")
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
