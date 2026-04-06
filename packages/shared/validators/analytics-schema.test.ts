import { describe, expect, it } from "vitest"
import { analyticsQuerySchema, retentionQuerySchema, summaryQuerySchema } from "./analytics-schema"

// ── analyticsQuerySchema ──────────────────────────────────────────────

describe("analyticsQuerySchema", () => {
  const validInput = {
    from: "2025-01-01",
    to: "2025-01-31",
    granularity: "day" as const,
  }

  it("accepts valid inputs with all fields", () => {
    const result = analyticsQuerySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it("accepts valid inputs with optional locationId", () => {
    const result = analyticsQuerySchema.safeParse({
      ...validInput,
      locationId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    })
    expect(result.success).toBe(true)
  })

  it("defaults granularity to 'day' when not provided", () => {
    const result = analyticsQuerySchema.safeParse({
      from: "2025-01-01",
      to: "2025-01-31",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.granularity).toBe("day")
    }
  })

  it("accepts all granularity values", () => {
    for (const granularity of ["day", "week", "month"]) {
      const result = analyticsQuerySchema.safeParse({ ...validInput, granularity })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid date format for 'from'", () => {
    const result = analyticsQuerySchema.safeParse({
      ...validInput,
      from: "not-a-date",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid date format for 'to'", () => {
    const result = analyticsQuerySchema.safeParse({
      ...validInput,
      to: "31-01-2025",
    })
    expect(result.success).toBe(false)
  })

  it("rejects when 'from' is after 'to'", () => {
    const result = analyticsQuerySchema.safeParse({
      from: "2025-02-01",
      to: "2025-01-01",
      granularity: "day",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fromError = result.error.issues.find((i) => i.path.includes("from"))
      expect(fromError).toBeDefined()
    }
  })

  it("accepts when 'from' equals 'to'", () => {
    const result = analyticsQuerySchema.safeParse({
      from: "2025-01-15",
      to: "2025-01-15",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing 'from' field", () => {
    const result = analyticsQuerySchema.safeParse({ to: "2025-01-31" })
    expect(result.success).toBe(false)
  })

  it("rejects missing 'to' field", () => {
    const result = analyticsQuerySchema.safeParse({ from: "2025-01-01" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid granularity value", () => {
    const result = analyticsQuerySchema.safeParse({
      ...validInput,
      granularity: "quarter",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid locationId (not uuid)", () => {
    const result = analyticsQuerySchema.safeParse({
      ...validInput,
      locationId: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })
})

// ── retentionQuerySchema ──────────────────────────────────────────────

describe("retentionQuerySchema", () => {
  it("accepts valid months value", () => {
    const result = retentionQuerySchema.safeParse({ months: 6 })
    expect(result.success).toBe(true)
  })

  it("defaults months to 6 when not provided", () => {
    const result = retentionQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.months).toBe(6)
    }
  })

  it("coerces string to number", () => {
    const result = retentionQuerySchema.safeParse({ months: "8" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.months).toBe(8)
    }
  })

  it("accepts minimum value (3)", () => {
    const result = retentionQuerySchema.safeParse({ months: 3 })
    expect(result.success).toBe(true)
  })

  it("accepts maximum value (12)", () => {
    const result = retentionQuerySchema.safeParse({ months: 12 })
    expect(result.success).toBe(true)
  })

  it("rejects value below minimum (2)", () => {
    const result = retentionQuerySchema.safeParse({ months: 2 })
    expect(result.success).toBe(false)
  })

  it("rejects value above maximum (13)", () => {
    const result = retentionQuerySchema.safeParse({ months: 13 })
    expect(result.success).toBe(false)
  })

  it("rejects non-integer value", () => {
    const result = retentionQuerySchema.safeParse({ months: 6.5 })
    expect(result.success).toBe(false)
  })
})

// ── summaryQuerySchema ────────────────────────────────────────────────

describe("summaryQuerySchema", () => {
  it("accepts valid from and to dates", () => {
    const result = summaryQuerySchema.safeParse({
      from: "2025-01-01",
      to: "2025-01-31",
    })
    expect(result.success).toBe(true)
  })

  it("accepts when from equals to", () => {
    const result = summaryQuerySchema.safeParse({
      from: "2025-06-15",
      to: "2025-06-15",
    })
    expect(result.success).toBe(true)
  })

  it("rejects when from is after to", () => {
    const result = summaryQuerySchema.safeParse({
      from: "2025-12-31",
      to: "2025-01-01",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid from date format", () => {
    const result = summaryQuerySchema.safeParse({
      from: "Jan 1 2025",
      to: "2025-01-31",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid to date format", () => {
    const result = summaryQuerySchema.safeParse({
      from: "2025-01-01",
      to: "2025/01/31",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing from field", () => {
    const result = summaryQuerySchema.safeParse({ to: "2025-01-31" })
    expect(result.success).toBe(false)
  })

  it("rejects missing to field", () => {
    const result = summaryQuerySchema.safeParse({ from: "2025-01-01" })
    expect(result.success).toBe(false)
  })
})
