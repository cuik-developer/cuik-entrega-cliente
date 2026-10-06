// ─── Google Wallet save/delete callbacks ──────────────────────────────────
//
// When a class has `callbackOptions.url`, Google POSTs a signed message to it
// every time a user saves ("save") or removes ("del") an object of that class.
// This is the only install signal Google offers (Apple has the web service
// registration instead).
//
// Signature scheme: ECv2SigningOnly, the same one Google Pay uses (Tink's
// PaymentMethodTokenRecipient). Verified here with Node crypto, no library:
//   1. Google's root keys (https://pay.google.com/gp/m/issuer/keys) sign an
//      intermediate key:   sig over LV(senderId) LV(protocolVersion) LV(signedKey)
//   2. The intermediate key signs the message:
//                           sig over LV(senderId) LV(recipientId) LV(protocolVersion) LV(signedMessage)
//   LV = 4-byte little-endian length + UTF-8 bytes. ECDSA P-256 / SHA-256, DER signatures.
//   senderId = "GooglePayPasses", recipientId = the issuer id.

import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto"

export const GOOGLE_WALLET_CALLBACK_PATH = "/api/webhooks/google-wallet"
export const GOOGLE_PASSES_KEYS_URL = "https://pay.google.com/gp/m/issuer/keys"

const SENDER_ID = "GooglePayPasses"
const PROTOCOL_VERSION = "ECv2SigningOnly"
const KEYS_CACHE_MS = 60 * 60 * 1000

export type GoogleCallbackEventType = "save" | "del"

export type GoogleCallbackMessage = {
  classId: string
  objectId: string
  eventType: GoogleCallbackEventType
  expTimeMillis: number
  nonce: string
}

export type VerifyCallbackResult =
  | { ok: true; message: GoogleCallbackMessage }
  | { ok: false; error: string }

type RootKey = { keyValue: string; protocolVersion: string; keyExpiration?: string | number }

/**
 * Public HTTPS URL Google must call. `undefined` outside HTTPS deployments
 * (Google refuses plain http), so local dev never registers a callback.
 */
export function googleWalletCallbackUrl(
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
): string | undefined {
  if (!appUrl?.startsWith("https://")) return undefined
  return `${appUrl.replace(/\/+$/, "")}${GOOGLE_WALLET_CALLBACK_PATH}`
}

// ─── Root keys (cached) ───────────────────────────────────────────────────

let cachedKeys: RootKey[] | null = null
let cachedKeysAt = 0

async function fetchRootKeys(keysUrl: string, force = false): Promise<RootKey[]> {
  if (!force && cachedKeys && Date.now() - cachedKeysAt < KEYS_CACHE_MS) return cachedKeys
  const res = await fetch(keysUrl, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`keys fetch failed: ${res.status}`)
  const json = (await res.json()) as { keys?: RootKey[] }
  cachedKeys = (json.keys ?? []).filter((k) => k.protocolVersion === PROTOCOL_VERSION)
  cachedKeysAt = Date.now()
  return cachedKeys
}

/** Clears the cached root keys. Useful for testing. */
export function clearGoogleCallbackKeyCache(): void {
  cachedKeys = null
  cachedKeysAt = 0
}

// ─── Verification ─────────────────────────────────────────────────────────

function lengthValue(...parts: string[]): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf-8")
    const len = Buffer.alloc(4)
    len.writeUInt32LE(bytes.length, 0)
    chunks.push(len, bytes)
  }
  return Buffer.concat(chunks)
}

function publicKeyFromBase64(keyValue: string): KeyObject | null {
  try {
    return createPublicKey({ key: Buffer.from(keyValue, "base64"), format: "der", type: "spki" })
  } catch {
    return null
  }
}

function ecdsaVerify(key: KeyObject, data: Buffer, signatureB64: string): boolean {
  try {
    return cryptoVerify(
      "sha256",
      data,
      { key, dsaEncoding: "der" },
      Buffer.from(signatureB64, "base64"),
    )
  } catch {
    return false
  }
}

function notExpired(expiration: string | number | undefined, now: number): boolean {
  if (expiration === undefined || expiration === null || expiration === "") return true
  const ms = Number(expiration)
  return Number.isFinite(ms) && ms > now
}

export type VerifyCallbackOptions = {
  /** Google Wallet issuer id (the recipientId of the signed message). */
  issuerId: string
  /** Raw POST body as text, or the already-parsed JSON. */
  body: string | unknown
  /** Override for tests. */
  keysUrl?: string
  now?: number
}

/**
 * Verifies a Google Wallet callback and returns the unsealed message.
 * Never throws: every failure (bad JSON, unknown key, bad signature, expired)
 * comes back as `{ ok: false, error }`.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential validation chain; each early return is one rejection reason
export async function verifyGoogleWalletCallback(
  opts: VerifyCallbackOptions,
): Promise<VerifyCallbackResult> {
  const now = opts.now ?? Date.now()
  const keysUrl = opts.keysUrl ?? GOOGLE_PASSES_KEYS_URL

  let token: {
    protocolVersion?: string
    signature?: string
    signedMessage?: string
    intermediateSigningKey?: { signedKey?: string; signatures?: string[] }
  }
  try {
    token = typeof opts.body === "string" ? JSON.parse(opts.body) : (opts.body as typeof token)
  } catch {
    return { ok: false, error: "body is not valid JSON" }
  }
  if (!token || typeof token !== "object") return { ok: false, error: "body is not an object" }
  if (token.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, error: `unsupported protocolVersion ${String(token.protocolVersion)}` }
  }
  const signedKey = token.intermediateSigningKey?.signedKey
  const keySignatures = token.intermediateSigningKey?.signatures
  if (!signedKey || !Array.isArray(keySignatures) || keySignatures.length === 0) {
    return { ok: false, error: "missing intermediateSigningKey" }
  }
  if (!token.signature || !token.signedMessage) {
    return { ok: false, error: "missing signature or signedMessage" }
  }

  // 1. Intermediate key must be signed by one of Google's root keys.
  const keyData = lengthValue(SENDER_ID, PROTOCOL_VERSION, signedKey)
  const verifyIntermediate = async (force: boolean): Promise<boolean> => {
    const roots = await fetchRootKeys(keysUrl, force)
    for (const root of roots) {
      if (!notExpired(root.keyExpiration, now)) continue
      const key = publicKeyFromBase64(root.keyValue)
      if (!key) continue
      if (keySignatures.some((sig) => ecdsaVerify(key, keyData, sig))) return true
    }
    return false
  }
  let intermediateOk: boolean
  try {
    // A fresh Google key rotation shows up as a failure with cached keys: refetch once.
    intermediateOk = (await verifyIntermediate(false)) || (await verifyIntermediate(true))
  } catch (err) {
    return {
      ok: false,
      error: `could not load Google keys: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!intermediateOk) return { ok: false, error: "intermediate signing key not signed by Google" }

  let intermediate: { keyValue?: string; keyExpiration?: string | number }
  try {
    intermediate = JSON.parse(signedKey)
  } catch {
    return { ok: false, error: "signedKey is not valid JSON" }
  }
  if (!intermediate.keyValue) return { ok: false, error: "signedKey without keyValue" }
  if (!notExpired(intermediate.keyExpiration, now)) {
    return { ok: false, error: "intermediate signing key expired" }
  }
  const intermediateKey = publicKeyFromBase64(intermediate.keyValue)
  if (!intermediateKey)
    return { ok: false, error: "intermediate keyValue is not a valid public key" }

  // 2. Message must be signed by the intermediate key, for this issuer.
  const messageData = lengthValue(SENDER_ID, opts.issuerId, PROTOCOL_VERSION, token.signedMessage)
  if (!ecdsaVerify(intermediateKey, messageData, token.signature)) {
    return { ok: false, error: "message signature invalid" }
  }

  // 3. Unseal and sanity-check the message itself.
  let message: Partial<GoogleCallbackMessage> & { expTimeMillis?: string | number }
  try {
    message = JSON.parse(token.signedMessage)
  } catch {
    return { ok: false, error: "signedMessage is not valid JSON" }
  }
  const expTimeMillis = Number(message.expTimeMillis)
  if (!Number.isFinite(expTimeMillis) || expTimeMillis <= now) {
    return { ok: false, error: "message expired" }
  }
  if (message.eventType !== "save" && message.eventType !== "del") {
    return { ok: false, error: `unknown eventType ${String(message.eventType)}` }
  }
  if (!message.objectId || !message.classId || !message.nonce) {
    return { ok: false, error: "message missing objectId, classId or nonce" }
  }

  return {
    ok: true,
    message: {
      classId: message.classId,
      objectId: message.objectId,
      eventType: message.eventType,
      expTimeMillis,
      nonce: message.nonce,
    },
  }
}
