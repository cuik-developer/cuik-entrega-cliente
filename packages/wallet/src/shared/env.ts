import { z } from "zod"
import type { AppleApnsConfig, AppleWalletConfig, GoogleWalletConfig } from "./types"

// ─── Apple Signing Env Schema ──────────────────────────────────────────

const appleSigningSchema = z.object({
  APPLE_TEAM_ID: z.string().min(1),
  APPLE_PASS_TYPE_ID: z.string().min(1),
  APPLE_SIGNER_KEY_BASE64: z.string().min(1),
  APPLE_SIGNER_CERT_BASE64: z.string().min(1),
  APPLE_WWDR_BASE64: z.string().min(1),
  APPLE_AUTH_SECRET: z.string().min(1),
  APPLE_SIGNER_KEY_PASSPHRASE: z.string().optional(),
})

// ─── Apple APNs Env Schema ─────────────────────────────────────────────

const appleApnsSchema = z.object({
  APPLE_APNS_KEY_ID: z.string().min(1),
  APPLE_APNS_TEAM_ID: z.string().min(1),
  APPLE_APNS_P8_BASE64: z.string().min(1),
  APPLE_APNS_TOPIC: z.string().min(1),
})

// ─── Apple Web Service URL ─────────────────────────────────────────────

const appleWebServiceSchema = z.object({
  APPLE_WEBSERVICE_URL: z.string().url(),
})

// ─── Google Wallet Env Schema ──────────────────────────────────────────

const googleSchema = z.object({
  GOOGLE_WALLET_ISSUER_ID: z.string().min(1),
  GOOGLE_WALLET_SA_JSON_B64: z.string().min(1),
})

// ─── Validation Functions ──────────────────────────────────────────────

/**
 * Validate Apple Wallet signing environment variables.
 * Returns typed config or null with console.warn on missing vars.
 * Never throws.
 */
export function validateAppleEnv(): AppleWalletConfig | null {
  const result = appleSigningSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ")
    console.warn(`[Wallet:Apple] Disabled — missing env vars: ${missing}`)
    return null
  }

  const wsResult = appleWebServiceSchema.safeParse(process.env)
  const webServiceUrl = wsResult.success ? wsResult.data.APPLE_WEBSERVICE_URL : ""

  if (!wsResult.success) {
    console.warn(
      "[Wallet:Apple] APPLE_WEBSERVICE_URL not set — Web Service Protocol callbacks will not work",
    )
  }

  return {
    teamId: result.data.APPLE_TEAM_ID,
    passTypeId: result.data.APPLE_PASS_TYPE_ID,
    signerKeyBase64: result.data.APPLE_SIGNER_KEY_BASE64,
    signerCertBase64: result.data.APPLE_SIGNER_CERT_BASE64,
    signerKeyPassphrase: result.data.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
    wwdrBase64: result.data.APPLE_WWDR_BASE64,
    authSecret: result.data.APPLE_AUTH_SECRET,
    webServiceUrl,
  }
}

/**
 * Validate Apple APNs environment variables.
 * Returns typed config or null with console.warn on missing vars.
 * Never throws.
 */
export function validateAppleApnsEnv(): AppleApnsConfig | null {
  const result = appleApnsSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ")
    console.warn(`[Wallet:APNs] Disabled — missing env vars: ${missing}`)
    return null
  }

  return {
    keyId: result.data.APPLE_APNS_KEY_ID,
    teamId: result.data.APPLE_APNS_TEAM_ID,
    p8Base64: result.data.APPLE_APNS_P8_BASE64,
    topic: result.data.APPLE_APNS_TOPIC,
  }
}

/**
 * Validate Google Wallet environment variables.
 * Returns typed config or null with console.warn on missing vars.
 * Never throws.
 */
export function validateGoogleEnv(): GoogleWalletConfig | null {
  const result = googleSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ")
    console.warn(`[Wallet:Google] Disabled — missing env vars: ${missing}`)
    return null
  }

  try {
    const decoded = Buffer.from(result.data.GOOGLE_WALLET_SA_JSON_B64, "base64").toString("utf-8")
    const sa = JSON.parse(decoded) as {
      client_email?: string
      private_key?: string
    }

    if (!sa.client_email || !sa.private_key) {
      console.warn(
        "[Wallet:Google] Disabled — service account JSON missing client_email or private_key",
      )
      return null
    }

    return {
      issuerId: result.data.GOOGLE_WALLET_ISSUER_ID,
      serviceAccountJson: {
        client_email: sa.client_email,
        private_key: sa.private_key,
      },
    }
  } catch {
    console.warn("[Wallet:Google] Disabled — failed to decode GOOGLE_WALLET_SA_JSON_B64")
    return null
  }
}

/**
 * Check if Apple Wallet is configured (quick check, no parsing).
 */
export function isAppleConfigured(): boolean {
  return !!(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_PASS_TYPE_ID &&
    process.env.APPLE_SIGNER_KEY_BASE64 &&
    process.env.APPLE_SIGNER_CERT_BASE64 &&
    process.env.APPLE_WWDR_BASE64 &&
    process.env.APPLE_AUTH_SECRET
  )
}

/**
 * Check if Google Wallet is configured (quick check, no parsing).
 */
export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SA_JSON_B64)
}

/**
 * Get full Apple config (signing + APNs + web service URL).
 * Returns null if signing env vars are missing.
 */
export function getAppleConfig(): (AppleWalletConfig & { apns: AppleApnsConfig | null }) | null {
  const signing = validateAppleEnv()
  if (!signing) return null

  const apns = validateAppleApnsEnv()
  return { ...signing, apns }
}

/**
 * Get full Google config.
 * Returns null if env vars are missing.
 */
export function getGoogleConfig(): GoogleWalletConfig | null {
  return validateGoogleEnv()
}
