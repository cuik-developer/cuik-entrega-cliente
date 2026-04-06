import { describe, expect, it } from "vitest"
import { generateAuthToken, verifyAuthToken } from "./auth-token"

const SECRET = "test-secret-key-for-hmac-256"
const SERIAL = "cuik:cafe:a1b2c3d4e5f6"

describe("generateAuthToken", () => {
  it("produces a hex string", () => {
    const token = generateAuthToken(SECRET, SERIAL)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is deterministic for the same input", () => {
    const a = generateAuthToken(SECRET, SERIAL)
    const b = generateAuthToken(SECRET, SERIAL)
    expect(a).toBe(b)
  })

  it("produces different tokens for different serials", () => {
    const a = generateAuthToken(SECRET, "cuik:cafe:aaaaaaaaaaaa")
    const b = generateAuthToken(SECRET, "cuik:cafe:bbbbbbbbbbbb")
    expect(a).not.toBe(b)
  })

  it("produces different tokens for different secrets", () => {
    const a = generateAuthToken("secret-1", SERIAL)
    const b = generateAuthToken("secret-2", SERIAL)
    expect(a).not.toBe(b)
  })
})

describe("verifyAuthToken", () => {
  it("returns true for a correct token", () => {
    const token = generateAuthToken(SECRET, SERIAL)
    expect(verifyAuthToken(SECRET, SERIAL, token)).toBe(true)
  })

  it("returns false for a wrong token", () => {
    expect(verifyAuthToken(SECRET, SERIAL, "deadbeef".repeat(8))).toBe(false)
  })

  it("returns false for a wrong serial", () => {
    const token = generateAuthToken(SECRET, SERIAL)
    expect(verifyAuthToken(SECRET, "cuik:other:000000000000", token)).toBe(false)
  })

  it("returns false for a wrong secret", () => {
    const token = generateAuthToken(SECRET, SERIAL)
    expect(verifyAuthToken("wrong-secret", SERIAL, token)).toBe(false)
  })

  it("returns false for a token of different length", () => {
    expect(verifyAuthToken(SECRET, SERIAL, "short")).toBe(false)
  })
})
