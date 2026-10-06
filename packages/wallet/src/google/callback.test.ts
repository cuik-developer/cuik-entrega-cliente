import { createPrivateKey, sign as cryptoSign, generateKeyPairSync } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearGoogleCallbackKeyCache,
  googleWalletCallbackUrl,
  verifyGoogleWalletCallback,
} from "./callback"

// ─── Test helpers: forge a Google-style ECv2SigningOnly token ─────────────

const ISSUER_ID = "3388000000012345678"
const NOW = 1_800_000_000_000

function lv(...parts: string[]): Buffer {
  return Buffer.concat(
    parts.flatMap((p) => {
      const b = Buffer.from(p, "utf-8")
      const l = Buffer.alloc(4)
      l.writeUInt32LE(b.length, 0)
      return [l, b]
    }),
  )
}

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  return {
    pubB64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    priv: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  }
}

function signDer(privPem: string, data: Buffer): string {
  return cryptoSign("sha256", data, {
    key: createPrivateKey(privPem),
    dsaEncoding: "der",
  }).toString("base64")
}

const root = keyPair()
const intermediate = keyPair()
const stranger = keyPair()

function buildToken(opts: {
  message?: Record<string, unknown>
  rootPriv?: string
  intermediatePriv?: string
  recipientId?: string
  keyExpiration?: number
}) {
  const signedKey = JSON.stringify({
    keyValue: intermediate.pubB64,
    keyExpiration: String(opts.keyExpiration ?? NOW + 86_400_000),
  })
  const signedMessage = JSON.stringify(
    opts.message ?? {
      classId: `${ISSUER_ID}.Dfrios-Loyalty`,
      objectId: `${ISSUER_ID}.cuik-dfrios-abc123`,
      eventType: "save",
      expTimeMillis: String(NOW + 60_000),
      nonce: "nonce-1",
    },
  )
  return {
    protocolVersion: "ECv2SigningOnly",
    intermediateSigningKey: {
      signedKey,
      signatures: [
        signDer(opts.rootPriv ?? root.priv, lv("GooglePayPasses", "ECv2SigningOnly", signedKey)),
      ],
    },
    signedMessage,
    signature: signDer(
      opts.intermediatePriv ?? intermediate.priv,
      lv("GooglePayPasses", opts.recipientId ?? ISSUER_ID, "ECv2SigningOnly", signedMessage),
    ),
  }
}

const fetchMock = vi.fn()
const keysResponse = (keys: unknown[]) => ({ ok: true, status: 200, json: async () => ({ keys }) })

describe("verifyGoogleWalletCallback", () => {
  beforeEach(() => {
    clearGoogleCallbackKeyCache()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(
      keysResponse([
        {
          keyValue: root.pubB64,
          protocolVersion: "ECv2SigningOnly",
          keyExpiration: String(NOW + 1e9),
        },
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("accepts a message signed by an intermediate key that Google's root key signed", async () => {
    const result = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: JSON.stringify(buildToken({})),
      now: NOW,
    })
    expect(result).toEqual({
      ok: true,
      message: {
        classId: `${ISSUER_ID}.Dfrios-Loyalty`,
        objectId: `${ISSUER_ID}.cuik-dfrios-abc123`,
        eventType: "save",
        expTimeMillis: NOW + 60_000,
        nonce: "nonce-1",
      },
    })
  })

  it("rejects an intermediate key not signed by Google", async () => {
    const result = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: buildToken({ rootPriv: stranger.priv }),
      now: NOW,
    })
    expect(result).toEqual({ ok: false, error: "intermediate signing key not signed by Google" })
    // cached keys failed → refetched once before giving up
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("rejects a message signed by someone else", async () => {
    const result = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: buildToken({ intermediatePriv: stranger.priv }),
      now: NOW,
    })
    expect(result).toEqual({ ok: false, error: "message signature invalid" })
  })

  it("rejects a message addressed to another issuer", async () => {
    const result = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: buildToken({ recipientId: "9999" }),
      now: NOW,
    })
    expect(result).toEqual({ ok: false, error: "message signature invalid" })
  })

  it("rejects expired messages and expired intermediate keys", async () => {
    const expiredMsg = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: buildToken({
        message: {
          classId: "c",
          objectId: "o",
          eventType: "del",
          expTimeMillis: String(NOW - 1),
          nonce: "n",
        },
      }),
      now: NOW,
    })
    expect(expiredMsg).toEqual({ ok: false, error: "message expired" })

    const expiredKey = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: buildToken({ keyExpiration: NOW - 1 }),
      now: NOW,
    })
    expect(expiredKey).toEqual({ ok: false, error: "intermediate signing key expired" })
  })

  it("rejects garbage without throwing", async () => {
    expect(await verifyGoogleWalletCallback({ issuerId: ISSUER_ID, body: "not json" })).toEqual({
      ok: false,
      error: "body is not valid JSON",
    })
    expect(
      await verifyGoogleWalletCallback({ issuerId: ISSUER_ID, body: { protocolVersion: "ECv1" } }),
    ).toEqual({ ok: false, error: "unsupported protocolVersion ECv1" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports when Google's key endpoint is unreachable", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    const result = await verifyGoogleWalletCallback({
      issuerId: ISSUER_ID,
      body: buildToken({}),
      now: NOW,
    })
    expect(result).toEqual({
      ok: false,
      error: "could not load Google keys: keys fetch failed: 503",
    })
  })
})

describe("googleWalletCallbackUrl", () => {
  it("builds the HTTPS callback URL and refuses plain http", () => {
    expect(googleWalletCallbackUrl("https://cuik.org")).toBe(
      "https://cuik.org/api/webhooks/google-wallet",
    )
    expect(googleWalletCallbackUrl("https://cuik.org/")).toBe(
      "https://cuik.org/api/webhooks/google-wallet",
    )
    expect(googleWalletCallbackUrl("http://localhost:3077")).toBeUndefined()
    expect(googleWalletCallbackUrl(undefined)).toBeUndefined()
  })
})
