import { describe, expect, it } from "vitest"
import { campaignListSchema, createCampaignSchema, segmentFilterSchema } from "./campaign-schema"

// ── segmentFilterSchema ───────────────────────────────────────────────

describe("segmentFilterSchema", () => {
  it("accepts all preset types", () => {
    for (const preset of ["todos", "activos", "inactivos", "vip", "nuevos"]) {
      const result = segmentFilterSchema.safeParse({ preset })
      expect(result.success).toBe(true)
    }
  })

  it("accepts empty object (no preset, no conditions)", () => {
    const result = segmentFilterSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects invalid preset value", () => {
    const result = segmentFilterSchema.safeParse({ preset: "premium" })
    expect(result.success).toBe(false)
  })

  it("accepts custom conditions with valid fields", () => {
    const result = segmentFilterSchema.safeParse({
      conditions: [
        { field: "totalVisits", operator: "gte", value: 10 },
        { field: "tier", operator: "eq", value: "VIP" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("accepts conditions with between operator and valueTo", () => {
    const result = segmentFilterSchema.safeParse({
      conditions: [{ field: "totalVisits", operator: "between", value: 5, valueTo: 20 }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects conditions with invalid field name", () => {
    const result = segmentFilterSchema.safeParse({
      conditions: [{ field: "invalidField", operator: "eq", value: 1 }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects conditions with invalid operator", () => {
    const result = segmentFilterSchema.safeParse({
      conditions: [{ field: "totalVisits", operator: "like", value: 1 }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than 10 conditions", () => {
    const conditions = Array.from({ length: 11 }, () => ({
      field: "totalVisits" as const,
      operator: "gte" as const,
      value: 1,
    }))
    const result = segmentFilterSchema.safeParse({ conditions })
    expect(result.success).toBe(false)
  })

  it("accepts tagIds with valid UUIDs", () => {
    const result = segmentFilterSchema.safeParse({
      tagIds: ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"],
    })
    expect(result.success).toBe(true)
  })

  it("accepts preset combined with tagIds", () => {
    const result = segmentFilterSchema.safeParse({
      preset: "activos",
      tagIds: ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"],
    })
    expect(result.success).toBe(true)
  })
})

// ── createCampaignSchema ──────────────────────────────────────────────

describe("createCampaignSchema", () => {
  const validCampaign = {
    name: "Summer Promo",
    type: "push" as const,
    message: "Come visit us today!",
    segment: { preset: "todos" as const },
  }

  it("accepts a valid campaign with type push", () => {
    const result = createCampaignSchema.safeParse(validCampaign)
    expect(result.success).toBe(true)
  })

  it("accepts a valid campaign with type wallet_update", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      type: "wallet_update",
    })
    expect(result.success).toBe(true)
  })

  it("rejects email type (only push/wallet_update allowed)", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      type: "email",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const typeError = result.error.issues.find((i) => i.path.includes("type"))
      expect(typeError?.message).toContain("Only push and wallet_update")
    }
  })

  it("rejects missing name", () => {
    const { name, ...rest } = validCampaign
    const result = createCampaignSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("rejects empty name (after trim)", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      name: "   ",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing message", () => {
    const { message, ...rest } = validCampaign
    const result = createCampaignSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("rejects missing type", () => {
    const { type, ...rest } = validCampaign
    const result = createCampaignSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("rejects missing segment", () => {
    const { segment, ...rest } = validCampaign
    const result = createCampaignSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it("accepts valid scheduledAt datetime", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      scheduledAt: "2025-06-15T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid scheduledAt format", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      scheduledAt: "not-a-datetime",
    })
    expect(result.success).toBe(false)
  })

  it("rejects name exceeding 200 characters", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      name: "x".repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it("rejects message exceeding 150 characters", () => {
    const result = createCampaignSchema.safeParse({
      ...validCampaign,
      message: "x".repeat(151),
    })
    expect(result.success).toBe(false)
  })
})

// ── campaignListSchema ────────────────────────────────────────────────

describe("campaignListSchema", () => {
  it("applies default page (1) and limit (20)", () => {
    const result = campaignListSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(20)
    }
  })

  it("coerces string page and limit to numbers", () => {
    const result = campaignListSchema.safeParse({ page: "3", limit: "50" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
      expect(result.data.limit).toBe(50)
    }
  })

  it("accepts valid status filter", () => {
    for (const status of ["draft", "scheduled", "sending", "sent", "cancelled"]) {
      const result = campaignListSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid status value", () => {
    const result = campaignListSchema.safeParse({ status: "archived" })
    expect(result.success).toBe(false)
  })

  it("rejects page less than 1", () => {
    const result = campaignListSchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  it("rejects limit greater than 100", () => {
    const result = campaignListSchema.safeParse({ limit: 101 })
    expect(result.success).toBe(false)
  })

  it("rejects limit less than 1", () => {
    const result = campaignListSchema.safeParse({ limit: 0 })
    expect(result.success).toBe(false)
  })
})
