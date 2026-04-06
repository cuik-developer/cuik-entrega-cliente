import type { WebServiceDeps, WebServiceResponse } from "../shared/types"

/**
 * Extract the auth token from the Apple Wallet "ApplePass {token}" header.
 */
function extractAuthToken(authHeader: string): string | null {
  const match = authHeader.match(/^ApplePass\s+(.+)$/i)
  return match ? match[1].trim() : null
}

// ─── POST: Register Device ──────────────────────────────────────────────

/**
 * Handle device registration — Apple Wallet calls this when a user
 * adds a pass to their device.
 *
 * - Verifies the auth token (HMAC-SHA256 of serial)
 * - Inserts or reactivates the device+pushToken registration
 * - Returns 201 for new registration, 200 for existing (updated)
 */
export async function handleRegisterDevice(
  deps: WebServiceDeps,
  params: {
    deviceLibId: string
    passTypeId: string
    serialNumber: string
    pushToken: string
    authHeader: string
  },
): Promise<WebServiceResponse> {
  const { deviceLibId, passTypeId, serialNumber, pushToken, authHeader } = params

  // Verify auth token
  const token = extractAuthToken(authHeader)
  if (!token || !deps.verifyAuthToken(serialNumber, token)) {
    return { status: 401 }
  }

  if (!pushToken) {
    return { status: 400, body: { error: "Missing pushToken" } }
  }

  // Check if registration already exists
  const existing = await deps.findDeviceRegistration(deviceLibId, serialNumber)

  if (existing) {
    // Reactivate / update pushToken — return 200 (already registered)
    await deps.insertDeviceRegistration(deviceLibId, passTypeId, serialNumber, pushToken)
    return { status: 200 }
  }

  // New registration
  await deps.insertDeviceRegistration(deviceLibId, passTypeId, serialNumber, pushToken)
  return { status: 201 }
}

// ─── DELETE: Unregister Device ──────────────────────────────────────────

/**
 * Handle device unregistration — Apple Wallet calls this when a user
 * removes a pass from their device.
 *
 * - Verifies the auth token
 * - Soft-deletes the device registration
 * - Always returns 200 (Apple expects this)
 */
export async function handleUnregisterDevice(
  deps: WebServiceDeps,
  params: {
    deviceLibId: string
    serialNumber: string
    authHeader: string
  },
): Promise<WebServiceResponse> {
  const { deviceLibId, serialNumber, authHeader } = params

  const token = extractAuthToken(authHeader)
  if (!token || !deps.verifyAuthToken(serialNumber, token)) {
    return { status: 401 }
  }

  await deps.deleteDeviceRegistration(deviceLibId, serialNumber)
  return { status: 200 }
}

// ─── GET: List Serials for Device ───────────────────────────────────────

/**
 * Handle serial listing — Apple Wallet calls this to discover which
 * passes on a device have been updated.
 *
 * - No auth token required (Apple spec)
 * - Returns serial numbers and lastUpdated timestamp
 * - Returns 204 when no serials found (no content)
 */
export async function handleGetSerials(
  deps: WebServiceDeps,
  params: {
    deviceLibId: string
    passTypeId: string
    updatedSince?: string
  },
): Promise<WebServiceResponse> {
  const { deviceLibId, passTypeId, updatedSince } = params

  const data = await deps.getSerialsForDevice(deviceLibId, passTypeId, updatedSince)

  if (data.serialNumbers.length === 0) {
    return { status: 204 }
  }

  return {
    status: 200,
    body: {
      serialNumbers: data.serialNumbers,
      lastUpdated: data.lastUpdated,
    },
  }
}

// ─── GET: Get Updated Pass ──────────────────────────────────────────────

/**
 * Handle pass retrieval — Apple Wallet calls this to fetch an updated .pkpass.
 *
 * This handler does NOT generate the .pkpass itself (that's the caller's
 * responsibility). Instead, it:
 * - Verifies the auth token
 * - Checks If-None-Match header against stored ETag
 * - Returns 304 if the ETag matches (pass hasn't changed)
 * - Returns the pass instance data so the caller can regenerate the .pkpass
 *
 * The response with status 200 includes `body.passInstance` — the caller
 * must generate the .pkpass buffer and send it with appropriate headers.
 */
export async function handleGetPass(
  deps: WebServiceDeps,
  params: {
    passTypeId: string
    serialNumber: string
    authHeader: string
    ifNoneMatch?: string
    ifModifiedSince?: string
  },
): Promise<WebServiceResponse> {
  const { serialNumber, authHeader, ifNoneMatch, ifModifiedSince } = params

  // Verify auth token
  const token = extractAuthToken(authHeader)
  if (!token || !deps.verifyAuthToken(serialNumber, token)) {
    return { status: 401 }
  }

  // Look up pass instance
  const passInstance = await deps.getPassInstance(serialNumber)
  if (!passInstance) {
    return { status: 404 }
  }

  const notModifiedHeaders: Record<string, string> = {
    ...(passInstance.etag ? { ETag: passInstance.etag } : {}),
    ...(passInstance.lastUpdatedAt
      ? { "Last-Modified": passInstance.lastUpdatedAt.toUTCString() }
      : {}),
  }

  // Check If-None-Match (ETag) for 304 Not Modified
  if (ifNoneMatch && passInstance.etag && ifNoneMatch === passInstance.etag) {
    return { status: 304, headers: notModifiedHeaders }
  }

  // Check If-Modified-Since for 304 Not Modified
  // Only applies when the pass has a lastUpdatedAt and the client sent the header
  if (ifModifiedSince && passInstance.lastUpdatedAt) {
    const sinceDate = new Date(ifModifiedSince)
    if (!Number.isNaN(sinceDate.getTime()) && passInstance.lastUpdatedAt <= sinceDate) {
      return { status: 304, headers: notModifiedHeaders }
    }
  }

  // Signal to the caller that the pass needs to be regenerated.
  // The caller (API route) will use passInstance data to build the .pkpass.
  return {
    status: 200,
    body: {
      passInstance: {
        clientId: passInstance.clientId,
        designId: passInstance.designId,
        lastUpdatedAt: passInstance.lastUpdatedAt,
        etag: passInstance.etag,
        campaignMessage: passInstance.campaignMessage,
      },
    },
  }
}

// ─── POST: Log ──────────────────────────────────────────────────────────

/**
 * Handle log messages from Apple Wallet.
 *
 * Apple sends error logs here when something goes wrong with pass updates.
 * We log them server-side and always return 200.
 */
export function handleLog(body: unknown): WebServiceResponse {
  const logs =
    body && typeof body === "object" && "logs" in body ? (body as { logs: unknown[] }).logs : []

  if (Array.isArray(logs) && logs.length > 0) {
    console.warn("[Wallet:AppleWSP] Device logs:", JSON.stringify(logs))
  }

  return { status: 200 }
}
