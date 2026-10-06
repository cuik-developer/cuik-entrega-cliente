// ─── Google Wallet Loyalty Class Management ──────────────────────────────

import { googleWalletCallbackUrl } from "./callback"

const LOYALTY_CLASS_API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass"

// ─── Types ────────────────────────────────────────────────────────────────

export type EnsureLoyaltyClassParams = {
  accessToken: string
  issuerId: string
  classId: string
  programName: string
  issuerName: string
  programLogoUrl?: string
  hexBackgroundColor?: string
  heroImageUrl?: string
  wideProgramLogoUrl?: string
  /**
   * HTTPS URL Google calls on every save/delete of an object of this class.
   * Defaults to `${NEXT_PUBLIC_APP_URL}/api/webhooks/google-wallet`; omitted
   * (no callback) when the app is not served over HTTPS.
   */
  callbackUrl?: string
}

export type EnsureLoyaltyClassResult =
  | { ok: true; classId: string; created: boolean }
  | { ok: false; error: string; status?: number }

// ─── Module-Level Cache ───────────────────────────────────────────────────

const confirmedClasses = new Map<string, true>()

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Build a deterministic classId from issuerId and tenant name.
 *
 * Google Wallet IDs only allow alphanumeric, dots, hyphens, and underscores.
 * Pattern: `{issuerId}.{sanitizedTenantName}-Loyalty`
 */
export function buildGoogleClassId(issuerId: string, tenantName: string): string {
  const sanitized = tenantName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "")
  return `${issuerId}.${sanitized}-Loyalty`
}

/**
 * Ensure a loyalty class exists in Google Wallet.
 *
 * Strategy: Check module cache → GET class → POST if 404 → cache on success.
 * 409 Conflict on POST is treated as success (race condition safety).
 *
 * @param params - Class details and access token
 * @returns Discriminated union: `{ ok: true, classId, created }` or `{ ok: false, error, status }`
 */
export async function ensureLoyaltyClass(
  params: EnsureLoyaltyClassParams,
): Promise<EnsureLoyaltyClassResult> {
  const { accessToken, classId } = params

  // Fast path: already confirmed in this process
  if (confirmedClasses.has(classId)) {
    return { ok: true, classId, created: false }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }

  const callbackUrl = params.callbackUrl ?? googleWalletCallbackUrl()

  // GET — check if class exists
  try {
    const getResponse = await fetch(`${LOYALTY_CLASS_API_BASE}/${classId}`, {
      method: "GET",
      headers,
    })

    if (getResponse.ok) {
      // Classes created before callbacks existed: register the URL once.
      // Failure there is logged, not fatal — the class still works without it.
      const registered = callbackUrl
        ? await registerCallbackUrl(classId, headers, getResponse, callbackUrl)
        : true
      if (registered) confirmedClasses.set(classId, true)
      return { ok: true, classId, created: false }
    }

    if (getResponse.status !== 404) {
      const errorText = await getResponse.text().catch(() => "Unknown error")
      return {
        ok: false,
        error: `[Wallet:Google] GET loyalty class failed: ${getResponse.status} ${errorText}`,
        status: getResponse.status,
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `[Wallet:Google] GET loyalty class error: ${message}`,
    }
  }

  // POST — create class (GET returned 404)
  const classPayload: Record<string, unknown> = {
    id: classId,
    issuerName: params.issuerName,
    programName: params.programName,
    reviewStatus: "UNDER_REVIEW",
  }

  if (params.programLogoUrl) {
    classPayload.programLogo = {
      sourceUri: { uri: params.programLogoUrl },
    }
  }

  if (params.hexBackgroundColor) {
    classPayload.hexBackgroundColor = params.hexBackgroundColor
  }

  if (params.heroImageUrl) {
    classPayload.heroImage = {
      sourceUri: { uri: params.heroImageUrl },
    }
  }

  if (params.wideProgramLogoUrl) {
    classPayload.wideProgramLogo = {
      sourceUri: { uri: params.wideProgramLogoUrl },
    }
  }

  if (callbackUrl) {
    classPayload.callbackOptions = { url: callbackUrl }
  }

  try {
    const postResponse = await fetch(LOYALTY_CLASS_API_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify(classPayload),
    })

    if (postResponse.ok) {
      confirmedClasses.set(classId, true)
      return { ok: true, classId, created: true }
    }

    // 409 Conflict = class already exists (race condition with another request)
    if (postResponse.status === 409) {
      confirmedClasses.set(classId, true)
      return { ok: true, classId, created: false }
    }

    const errorText = await postResponse.text().catch(() => "Unknown error")
    return {
      ok: false,
      error: `[Wallet:Google] POST loyalty class failed: ${postResponse.status} ${errorText}`,
      status: postResponse.status,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `[Wallet:Google] POST loyalty class error: ${message}`,
    }
  }
}

// ─── Update Loyalty Class ────────────────────────────────────────────────

export type UpdateLoyaltyClassParams = {
  accessToken: string
  classId: string
  programName: string
  issuerName: string
  programLogoUrl?: string
  hexBackgroundColor?: string
  heroImageUrl?: string
  wideProgramLogoUrl?: string
  /** See EnsureLoyaltyClassParams.callbackUrl. PUT replaces the class, so it must be re-sent. */
  callbackUrl?: string
}

export type UpdateLoyaltyClassResult =
  | { ok: true; classId: string }
  | { ok: false; error: string; status?: number }

/**
 * Update an existing loyalty class in Google Wallet via PUT.
 *
 * PUT replaces the entire class, so all mandatory fields are included.
 * Cache is invalidated before the request and re-added on success.
 *
 * @param params - Class details and access token
 * @returns Discriminated union: `{ ok: true, classId }` or `{ ok: false, error, status }`
 */
export async function updateLoyaltyClass(
  params: UpdateLoyaltyClassParams,
): Promise<UpdateLoyaltyClassResult> {
  const { accessToken, classId } = params

  // Invalidate cache before PUT
  confirmedClasses.delete(classId)

  const classPayload: Record<string, unknown> = {
    id: classId,
    issuerName: params.issuerName,
    programName: params.programName,
    reviewStatus: "UNDER_REVIEW",
  }

  if (params.programLogoUrl) {
    classPayload.programLogo = {
      sourceUri: { uri: params.programLogoUrl },
    }
  }

  if (params.hexBackgroundColor) {
    classPayload.hexBackgroundColor = params.hexBackgroundColor
  }

  if (params.heroImageUrl) {
    classPayload.heroImage = {
      sourceUri: { uri: params.heroImageUrl },
    }
  }

  if (params.wideProgramLogoUrl) {
    classPayload.wideProgramLogo = {
      sourceUri: { uri: params.wideProgramLogoUrl },
    }
  }

  const callbackUrl = params.callbackUrl ?? googleWalletCallbackUrl()
  if (callbackUrl) {
    classPayload.callbackOptions = { url: callbackUrl }
  }

  try {
    const putResponse = await fetch(`${LOYALTY_CLASS_API_BASE}/${classId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(classPayload),
    })

    if (putResponse.ok) {
      confirmedClasses.set(classId, true)
      return { ok: true, classId }
    }

    const errorText = await putResponse.text().catch(() => "Unknown error")
    return {
      ok: false,
      error: `[Wallet:Google] PUT loyalty class failed: ${putResponse.status} ${errorText}`,
      status: putResponse.status,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: `[Wallet:Google] PUT loyalty class error: ${message}`,
    }
  }
}

/**
 * Makes sure an existing class carries our callback URL. Returns true when it
 * already did or the PATCH succeeded (so the class can be cached as confirmed).
 */
async function registerCallbackUrl(
  classId: string,
  headers: Record<string, string>,
  getResponse: Response,
  callbackUrl: string,
): Promise<boolean> {
  const existing = (await getResponse.json().catch(() => null)) as {
    callbackOptions?: { url?: string }
  } | null
  if (!existing || existing.callbackOptions?.url === callbackUrl) return true

  const patchResponse = await fetch(`${LOYALTY_CLASS_API_BASE}/${classId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ callbackOptions: { url: callbackUrl } }),
  })
  if (!patchResponse.ok) {
    const errorText = await patchResponse.text().catch(() => "Unknown error")
    console.warn(
      `[Wallet:Google] PATCH callbackOptions failed for ${classId}: ${patchResponse.status} ${errorText}`,
    )
    return false
  }
  console.info(`[Wallet:Google] callbackOptions registered for ${classId}`)
  return true
}

/**
 * Clear the confirmed classes cache. Useful for testing.
 */
export function clearLoyaltyClassCache(): void {
  confirmedClasses.clear()
}
