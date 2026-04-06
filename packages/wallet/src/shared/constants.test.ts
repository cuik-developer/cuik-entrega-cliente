import { describe, expect, it } from "vitest"
import {
  APNS_PORT,
  APNS_PRODUCTION_HOST,
  APNS_SANDBOX_HOST,
  ASSET_CACHE_MAX_ENTRIES,
  ASSET_CACHE_TTL_MS,
  GOOGLE_OAUTH2_TOKEN_URL,
  GOOGLE_SAVE_URL_BASE,
  GOOGLE_WALLET_API_BASE,
  GOOGLE_WALLET_SCOPE,
  STAMP_SIZE,
  STAMPS_PER_ROW,
  STRIP_HEIGHT_1X,
  STRIP_HEIGHT_2X,
  STRIP_WIDTH_1X,
  STRIP_WIDTH_2X,
} from "./constants"

describe("strip image dimensions", () => {
  it("@2x dimensions are positive", () => {
    expect(STRIP_WIDTH_2X).toBeGreaterThan(0)
    expect(STRIP_HEIGHT_2X).toBeGreaterThan(0)
  })

  it("@1x dimensions are positive", () => {
    expect(STRIP_WIDTH_1X).toBeGreaterThan(0)
    expect(STRIP_HEIGHT_1X).toBeGreaterThan(0)
  })

  it("@2x is exactly 2x the @1x dimensions", () => {
    expect(STRIP_WIDTH_2X).toBe(STRIP_WIDTH_1X * 2)
    expect(STRIP_HEIGHT_2X).toBe(STRIP_HEIGHT_1X * 2)
  })

  it("stamp size is positive", () => {
    expect(STAMP_SIZE).toBeGreaterThan(0)
  })

  it("stamps per row is positive", () => {
    expect(STAMPS_PER_ROW).toBeGreaterThan(0)
  })
})

describe("Google API URLs", () => {
  it("wallet API base is a valid HTTPS URL", () => {
    expect(GOOGLE_WALLET_API_BASE).toMatch(/^https:\/\//)
  })

  it("OAuth2 token URL is a valid HTTPS URL", () => {
    expect(GOOGLE_OAUTH2_TOKEN_URL).toMatch(/^https:\/\//)
  })

  it("save URL base is a valid HTTPS URL", () => {
    expect(GOOGLE_SAVE_URL_BASE).toMatch(/^https:\/\//)
  })

  it("wallet scope is a valid HTTPS URL", () => {
    expect(GOOGLE_WALLET_SCOPE).toMatch(/^https:\/\//)
  })
})

describe("APNs constants", () => {
  it("production host is a valid hostname", () => {
    expect(APNS_PRODUCTION_HOST).toContain("push.apple.com")
  })

  it("sandbox host is a valid hostname", () => {
    expect(APNS_SANDBOX_HOST).toContain("push.apple.com")
    expect(APNS_SANDBOX_HOST).toContain("sandbox")
  })

  it("port is 443", () => {
    expect(APNS_PORT).toBe(443)
  })
})

describe("asset cache constants", () => {
  it("max entries is positive", () => {
    expect(ASSET_CACHE_MAX_ENTRIES).toBeGreaterThan(0)
  })

  it("TTL is positive", () => {
    expect(ASSET_CACHE_TTL_MS).toBeGreaterThan(0)
  })
})
