import { describe, expect, it } from "vitest"
import type { AdminCampaignDetail, AdminCampaignRow } from "@/lib/admin/campaign-admin"
import { isFailed } from "@/lib/admin/campaign-labels"
import {
  redactCampaignDetailForStaff,
  redactCampaignRowForStaff,
  STAFF_CAMPAIGN_ERROR_TEXT,
} from "@/lib/admin/staff-redact"

function detail(overrides: Partial<AdminCampaignDetail> = {}): AdminCampaignDetail {
  return {
    id: "c1",
    tenantId: "t1",
    tenantName: "Café",
    tenantSlug: "cafe",
    name: "Promo",
    type: "push",
    status: "draft",
    message: "Hola {{client.name}}",
    scheduledAt: null,
    sentAt: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    targetCount: 10,
    sentCount: 0,
    skippedNoPass: 1,
    failedNotifications: 2,
    lastError: "APNs 400 BadDeviceToken for Juan Pérez (+51 999 999 999)",
    lastErrorAt: "2026-10-20T10:01:00.000Z",
    recurringId: null,
    recurringName: null,
    automation: null,
    effectiveness: null,
    segment: { segmentName: "VIP", filter: { phone: "+51 999" } },
    byChannel: [{ channel: "wallet_push", sent: 8, delivered: 7, failed: 2 }],
    failures: [
      {
        clientId: "k1",
        clientName: "Juan Pérez",
        channel: "wallet_push",
        error: "BadDeviceToken",
        sentAt: null,
      },
    ],
    content: { lastError: "raw", internal: true },
    ...overrides,
  }
}

describe("redactCampaignDetailForStaff", () => {
  it("drops failures, raw content, raw lastError and segment filter", () => {
    const out = redactCampaignDetailForStaff(detail())
    expect(out.failures).toEqual([])
    expect(out.failuresHidden).toBe(true)
    expect(out.content).toBeNull()
    expect(out.lastError).toBe(STAFF_CAMPAIGN_ERROR_TEXT)
    expect(out.hasError).toBe(true)
    expect(out.segment).toEqual({ segmentName: "VIP", filter: null })
    expect(JSON.stringify(out)).not.toContain("Juan")
    expect(JSON.stringify(out)).not.toContain("999")
  })

  it("keeps what is needed to view the campaign and still marks it failed", () => {
    const out = redactCampaignDetailForStaff(detail())
    expect(out.message).toBe("Hola {{client.name}}")
    expect(out.byChannel).toEqual([{ channel: "wallet_push", sent: 8, delivered: 7, failed: 2 }])
    expect(isFailed(out)).toBe(true)
  })

  it("has no error text when the campaign has no error", () => {
    const out = redactCampaignDetailForStaff(detail({ lastError: null, status: "sent" }))
    expect(out.lastError).toBeNull()
    expect(out.hasError).toBe(false)
    expect(isFailed(out)).toBe(false)
  })

  it("is an allow-list: unknown extra fields never reach staff", () => {
    const withExtra = { ...detail(), secretInternal: "x" } as AdminCampaignDetail
    expect(redactCampaignDetailForStaff(withExtra)).not.toHaveProperty("secretInternal")
  })
})

describe("redactCampaignRowForStaff", () => {
  it("replaces the raw lastError in list rows and keeps the rest", () => {
    const row: AdminCampaignRow = detail()
    const redacted = redactCampaignRowForStaff(row)
    expect(redacted.lastError).toBe(STAFF_CAMPAIGN_ERROR_TEXT)
    expect(redacted.name).toBe(row.name)
    expect(redactCampaignRowForStaff({ ...row, lastError: null }).lastError).toBeNull()
  })
})
