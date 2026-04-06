import { describe, expect, it } from "vitest"
import { tenantBrandingSchema } from "./branding-schema"

describe("tenantBrandingSchema", () => {
  const validConfig = {
    primaryColor: "#0e70db",
    accentColor: "#ff4810",
    logoUrl: "https://cdn.cuik.app/logos/tenant-x.png",
  }

  it("accepts a valid branding config with all fields", () => {
    const result = tenantBrandingSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validConfig)
    }
  })

  it("accepts null logoUrl", () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: "#1a2b3c",
      accentColor: "#ff0000",
      logoUrl: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.logoUrl).toBeNull()
    }
  })

  it("defaults logoUrl to null when not provided", () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: "#1a2b3c",
      accentColor: "#ff0000",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.logoUrl).toBeNull()
    }
  })

  it("rejects invalid hex color 'red'", () => {
    const result = tenantBrandingSchema.safeParse({
      ...validConfig,
      primaryColor: "red",
    })
    expect(result.success).toBe(false)
  })

  it("rejects short hex color '#fff'", () => {
    const result = tenantBrandingSchema.safeParse({
      ...validConfig,
      primaryColor: "#fff",
    })
    expect(result.success).toBe(false)
  })

  it("rejects hex color without hash prefix", () => {
    const result = tenantBrandingSchema.safeParse({
      ...validConfig,
      accentColor: "ff4810",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing required field accentColor", () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: "#0e70db",
      logoUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing required field primaryColor", () => {
    const result = tenantBrandingSchema.safeParse({
      accentColor: "#ff4810",
      logoUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid logoUrl (not a URL)", () => {
    const result = tenantBrandingSchema.safeParse({
      ...validConfig,
      logoUrl: "not-a-url",
    })
    expect(result.success).toBe(false)
  })

  it("accepts uppercase hex color", () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: "#0E70DB",
      accentColor: "#FF4810",
      logoUrl: null,
    })
    expect(result.success).toBe(true)
  })

  it("accepts mixed case hex color", () => {
    const result = tenantBrandingSchema.safeParse({
      primaryColor: "#0e70Db",
      accentColor: "#Ff4810",
      logoUrl: null,
    })
    expect(result.success).toBe(true)
  })
})
