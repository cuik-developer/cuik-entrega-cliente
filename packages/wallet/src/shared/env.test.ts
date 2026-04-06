import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isAppleConfigured, isGoogleConfigured, validateAppleEnv, validateGoogleEnv } from "./env"

// Save original env
const originalEnv = process.env

beforeEach(() => {
  // Reset env before each test
  process.env = { ...originalEnv }
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})

// ─── Helpers ──────────────────────────────────────────────────────────

function setAppleEnv() {
  process.env.APPLE_TEAM_ID = "TEAM123"
  process.env.APPLE_PASS_TYPE_ID = "pass.app.cuik.test"
  process.env.APPLE_SIGNER_KEY_BASE64 = "c2lnbmVyLWtleQ=="
  process.env.APPLE_SIGNER_CERT_BASE64 = "c2lnbmVyLWNlcnQ="
  process.env.APPLE_WWDR_BASE64 = "d3dkcg=="
  process.env.APPLE_AUTH_SECRET = "secret123"
}

function setGoogleEnv() {
  const sa = {
    client_email: "test@test.iam.gserviceaccount.com",
    private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
  }
  process.env.GOOGLE_WALLET_ISSUER_ID = "1234567890"
  process.env.GOOGLE_WALLET_SA_JSON_B64 = Buffer.from(JSON.stringify(sa)).toString("base64")
}

// ─── isAppleConfigured ──────────────────────────────────────────────

describe("isAppleConfigured", () => {
  it("returns false when env vars are missing", () => {
    expect(isAppleConfigured()).toBe(false)
  })

  it("returns true when all required vars present", () => {
    setAppleEnv()
    expect(isAppleConfigured()).toBe(true)
  })

  it("returns false when only some vars present", () => {
    process.env.APPLE_TEAM_ID = "TEAM123"
    expect(isAppleConfigured()).toBe(false)
  })
})

// ─── isGoogleConfigured ─────────────────────────────────────────────

describe("isGoogleConfigured", () => {
  it("returns false when env vars are missing", () => {
    expect(isGoogleConfigured()).toBe(false)
  })

  it("returns true when all required vars present", () => {
    setGoogleEnv()
    expect(isGoogleConfigured()).toBe(true)
  })

  it("returns false when only issuer ID present", () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "1234567890"
    expect(isGoogleConfigured()).toBe(false)
  })
})

// ─── validateAppleEnv ────────────────────────────────────────────────

describe("validateAppleEnv", () => {
  it("returns null when env vars missing", () => {
    expect(validateAppleEnv()).toBeNull()
  })

  it("logs a warning when env vars missing", () => {
    validateAppleEnv()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[Wallet:Apple] Disabled"))
  })

  it("returns typed config when all vars present", () => {
    setAppleEnv()
    const config = validateAppleEnv()
    expect(config).not.toBeNull()
    expect(config?.teamId).toBe("TEAM123")
    expect(config?.passTypeId).toBe("pass.app.cuik.test")
    expect(config?.authSecret).toBe("secret123")
  })

  it("never throws", () => {
    expect(() => validateAppleEnv()).not.toThrow()
    setAppleEnv()
    expect(() => validateAppleEnv()).not.toThrow()
  })
})

// ─── validateGoogleEnv ───────────────────────────────────────────────

describe("validateGoogleEnv", () => {
  it("returns null when env vars missing", () => {
    expect(validateGoogleEnv()).toBeNull()
  })

  it("logs a warning when env vars missing", () => {
    validateGoogleEnv()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[Wallet:Google] Disabled"))
  })

  it("returns typed config when all vars present", () => {
    setGoogleEnv()
    const config = validateGoogleEnv()
    expect(config).not.toBeNull()
    expect(config?.issuerId).toBe("1234567890")
    expect(config?.serviceAccountJson.client_email).toBe("test@test.iam.gserviceaccount.com")
  })

  it("returns null for invalid base64 JSON", () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "1234567890"
    process.env.GOOGLE_WALLET_SA_JSON_B64 = "not-valid-base64!!!"
    expect(validateGoogleEnv()).toBeNull()
  })

  it("returns null when JSON missing required fields", () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "1234567890"
    process.env.GOOGLE_WALLET_SA_JSON_B64 = Buffer.from(JSON.stringify({ foo: "bar" })).toString(
      "base64",
    )
    const config = validateGoogleEnv()
    expect(config).toBeNull()
  })

  it("never throws", () => {
    expect(() => validateGoogleEnv()).not.toThrow()
    setGoogleEnv()
    expect(() => validateGoogleEnv()).not.toThrow()
  })
})
