import { describe, expect, it, vi } from "vitest"

// Mock jose before importing the module under test
vi.mock("jose", () => {
  return {
    importPKCS8: vi.fn().mockResolvedValue("mock-rsa-key"),
    SignJWT: vi.fn().mockImplementation((payload) => {
      // Store payload for assertion
      const instance = {
        _payload: payload,
        setProtectedHeader: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue("mock.jwt.token"),
      }
      return instance
    }),
  }
})

import { importPKCS8, SignJWT } from "jose"
import { buildSaveToWalletUrl } from "./save-link"

describe("buildSaveToWalletUrl", () => {
  it("returns a URL starting with https://pay.google.com/gp/v/save/", async () => {
    const url = await buildSaveToWalletUrl({
      objectId: "123456.cuik:cafe:abc123",
      serviceAccountEmail: "test@test.iam.gserviceaccount.com",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      origins: ["https://app.cuik.org"],
    })

    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//)
  })

  it("appends the JWT token to the URL", async () => {
    const url = await buildSaveToWalletUrl({
      objectId: "123456.cuik:cafe:abc123",
      serviceAccountEmail: "test@test.iam.gserviceaccount.com",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      origins: ["https://app.cuik.org"],
    })

    expect(url).toBe("https://pay.google.com/gp/v/save/mock.jwt.token")
  })

  it("imports the private key with RS256 algorithm", async () => {
    await buildSaveToWalletUrl({
      objectId: "123456.cuik:cafe:abc123",
      serviceAccountEmail: "test@test.iam.gserviceaccount.com",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      origins: ["https://app.cuik.org"],
    })

    expect(importPKCS8).toHaveBeenCalledWith(
      "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      "RS256",
    )
  })

  it("creates JWT with correct claims", async () => {
    await buildSaveToWalletUrl({
      objectId: "123456.cuik:cafe:abc123",
      serviceAccountEmail: "test@test.iam.gserviceaccount.com",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      origins: ["https://app.cuik.org"],
    })

    expect(SignJWT).toHaveBeenCalledWith(
      expect.objectContaining({
        iss: "test@test.iam.gserviceaccount.com",
        aud: "google",
        typ: "savetowallet",
        origins: ["https://app.cuik.org"],
        payload: {
          loyaltyObjects: [{ id: "123456.cuik:cafe:abc123" }],
        },
      }),
    )
  })
})
