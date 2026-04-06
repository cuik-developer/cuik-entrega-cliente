import { describe, expect, it } from "vitest"
import {
  assignTagsSchema,
  clientExportSchema,
  createNoteSchema,
  createTagSchema,
} from "./crm-schema"

// ── createNoteSchema ──────────────────────────────────────────────────

describe("createNoteSchema", () => {
  it("accepts valid content", () => {
    const result = createNoteSchema.safeParse({ content: "Client called about promo" })
    expect(result.success).toBe(true)
  })

  it("trims whitespace from content", () => {
    const result = createNoteSchema.safeParse({ content: "  Some note  " })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe("Some note")
    }
  })

  it("rejects empty string (after trim)", () => {
    const result = createNoteSchema.safeParse({ content: "   " })
    expect(result.success).toBe(false)
  })

  it("rejects content exceeding 2000 characters", () => {
    const result = createNoteSchema.safeParse({ content: "x".repeat(2001) })
    expect(result.success).toBe(false)
  })

  it("accepts content at exactly 2000 characters", () => {
    const result = createNoteSchema.safeParse({ content: "x".repeat(2000) })
    expect(result.success).toBe(true)
  })

  it("rejects missing content field", () => {
    const result = createNoteSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ── createTagSchema ───────────────────────────────────────────────────

describe("createTagSchema", () => {
  it("accepts valid name and color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#ff0000" })
    expect(result.success).toBe(true)
  })

  it("accepts name without color (color is optional)", () => {
    const result = createTagSchema.safeParse({ name: "Frequent" })
    expect(result.success).toBe(true)
  })

  it("rejects invalid hex color (missing hash)", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "ff0000" })
    expect(result.success).toBe(false)
  })

  it("rejects 3-char hex shorthand", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#f00" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid hex characters", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#gggggg" })
    expect(result.success).toBe(false)
  })

  it("accepts uppercase hex color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#FF0000" })
    expect(result.success).toBe(true)
  })

  it("rejects name exceeding 50 characters", () => {
    const result = createTagSchema.safeParse({ name: "x".repeat(51) })
    expect(result.success).toBe(false)
  })

  it("rejects empty name (after trim)", () => {
    const result = createTagSchema.safeParse({ name: "   " })
    expect(result.success).toBe(false)
  })
})

// ── assignTagsSchema ──────────────────────────────────────────────────

describe("assignTagsSchema", () => {
  it("accepts valid tagIds array", () => {
    const result = assignTagsSchema.safeParse({
      tagIds: ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"],
    })
    expect(result.success).toBe(true)
  })

  it("accepts multiple valid UUIDs", () => {
    const result = assignTagsSchema.safeParse({
      tagIds: ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "b1ffcd00-ad1c-5ff9-cc7e-7cc0ce491b22"],
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty tagIds array", () => {
    const result = assignTagsSchema.safeParse({ tagIds: [] })
    expect(result.success).toBe(false)
  })

  it("rejects non-uuid strings in tagIds", () => {
    const result = assignTagsSchema.safeParse({ tagIds: ["not-a-uuid"] })
    expect(result.success).toBe(false)
  })

  it("rejects missing tagIds field", () => {
    const result = assignTagsSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ── clientExportSchema ────────────────────────────────────────────────

describe("clientExportSchema", () => {
  it("accepts empty object (all fields optional, format defaults to csv)", () => {
    const result = clientExportSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.format).toBe("csv")
    }
  })

  it("accepts valid status values", () => {
    for (const status of ["active", "inactive", "blocked"]) {
      const result = clientExportSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid status value", () => {
    const result = clientExportSchema.safeParse({ status: "deleted" })
    expect(result.success).toBe(false)
  })

  it("accepts valid date filters", () => {
    const result = clientExportSchema.safeParse({
      createdFrom: "2025-01-01",
      createdTo: "2025-12-31",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid date format for createdFrom", () => {
    const result = clientExportSchema.safeParse({
      createdFrom: "Jan 2025",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid date format for createdTo", () => {
    const result = clientExportSchema.safeParse({
      createdTo: "2025/12/31",
    })
    expect(result.success).toBe(false)
  })

  it("accepts tier filter", () => {
    const result = clientExportSchema.safeParse({ tier: "VIP" })
    expect(result.success).toBe(true)
  })

  it("accepts tagIds as comma-separated string", () => {
    const result = clientExportSchema.safeParse({
      tagIds: "uuid1,uuid2,uuid3",
    })
    expect(result.success).toBe(true)
  })

  it("rejects unsupported format", () => {
    const result = clientExportSchema.safeParse({ format: "xlsx" })
    expect(result.success).toBe(false)
  })
})
