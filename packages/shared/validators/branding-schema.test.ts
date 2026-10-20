import { describe, expect, it } from "vitest"
import { isOwnAssetUrl, tenantBrandingInputSchema, tenantBrandingSchema } from "./branding-schema"

describe("tenantBrandingSchema", () => {
  const validConfig = {
    primaryColor: "#0e70db",
    accentColor: "#ff4810",
    logoUrl: "/api/assets/tenants/t1/assets/logo.png",
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
    expect(tenantBrandingInputSchema.safeParse({ ...validConfig, iconUrl: "" }).success).toBe(false)
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
    expect(tenantBrandingInputSchema.safeParse({ ...validConfig, logoUrl: "" }).success).toBe(false)
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

describe("branding image URLs are restricted to our own assets", () => {
  const base = { primaryColor: "#0e70db", accentColor: "#ff4810" }
  const own = [
    "/api/assets/tenants/0b1c/assets/5f0e-uuid.png",
    "https://cuik.org/api/assets/tenants/x/assets/a.webp",
    "https://www.cuik.org/api/assets/tenants/x/assets/a.jpg",
  ]
  const foreign = [
    "https://evil.example/logo.png",
    "http://cuik.org/api/assets/x.png",
    "https://cuik.org.evil.example/api/assets/x.png",
    "https://evil.example/api/assets/x.png",
    "//evil.example/api/assets/x.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "/api/assets/",
    "/api/assets/../auth/session",
    "/api/assets//evil.example/x.png",
    "/api/assets/x.png?redirect=https://evil.example",
    "/api/assets/x.png#frag",
    '/api/assets/x" onerror="alert(1)',
    "/api/other/x.png",
    `/api/assets/${"a".repeat(600)}.png`,
  ]

  it.each(own)("accepts own asset %s (write and read)", (url) => {
    expect(isOwnAssetUrl(url)).toBe(true)
    expect(tenantBrandingInputSchema.parse({ ...base, logoUrl: url, iconUrl: url }).logoUrl).toBe(
      url,
    )
    const read = tenantBrandingSchema.parse({ ...base, logoUrl: url, iconUrl: url })
    expect(read.logoUrl).toBe(url)
    expect(read.iconUrl).toBe(url)
  })

  it.each(foreign)("rejects %s on write", (url) => {
    expect(isOwnAssetUrl(url)).toBe(false)
    expect(tenantBrandingInputSchema.safeParse({ ...base, logoUrl: url }).success).toBe(false)
    expect(tenantBrandingInputSchema.safeParse({ ...base, iconUrl: url }).success).toBe(false)
  })

  it.each(foreign)("reads a stored %s as null but keeps the colors", (url) => {
    const read = tenantBrandingSchema.safeParse({ ...base, logoUrl: url, iconUrl: url })
    expect(read.success).toBe(true)
    if (read.success) {
      expect(read.data).toEqual({ ...base, logoUrl: null, iconUrl: null })
    }
  })

  it("reads a non-string stored URL as null", () => {
    const read = tenantBrandingSchema.parse({ ...base, logoUrl: 42, iconUrl: {} })
    expect(read.logoUrl).toBeNull()
    expect(read.iconUrl).toBeNull()
  })
})
