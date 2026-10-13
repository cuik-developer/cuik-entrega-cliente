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
      expect(result.data).toEqual({ ...validConfig, iconUrl: null })
    }
  })

  it("keeps an explicit iconUrl and defaults it to null", () => {
    const withIcon = tenantBrandingSchema.parse({
      ...validConfig,
      iconUrl: "/api/assets/x/icon.png",
    })
    expect(withIcon.iconUrl).toBe("/api/assets/x/icon.png")
    expect(tenantBrandingSchema.parse(validConfig).iconUrl).toBeNull()
    expect(tenantBrandingSchema.safeParse({ ...validConfig, iconUrl: "" }).success).toBe(false)
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

  // Logos are stored as app-relative paths (/api/assets/...) as well as absolute URLs,
  // so the schema only rejects an empty string (pre-existing test expected a URL check).
  it("accepts a relative asset path and rejects an empty logoUrl", () => {
    expect(
      tenantBrandingSchema.safeParse({ ...validConfig, logoUrl: "/api/assets/t/x.png" }).success,
    ).toBe(true)
    expect(tenantBrandingSchema.safeParse({ ...validConfig, logoUrl: "" }).success).toBe(false)
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
