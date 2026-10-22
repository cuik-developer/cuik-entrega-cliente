import {
  and,
  appleDevices,
  clients,
  count,
  db,
  eq,
  isNull,
  passAssets,
  passDesigns,
  passInstances,
  promotions,
  rewards,
  tenants,
} from "@cuik/db"
import {
  createApplePass,
  generateAuthToken,
  handleGetPass,
  handleGetSerials,
  handleLog,
  handleRegisterDevice,
  handleUnregisterDevice,
  lastModifiedHeader,
  verifyAuthToken,
} from "@cuik/wallet/apple"
import type {
  AppleWalletConfig,
  PassAssetData,
  TemplateContext,
  WebServiceDeps,
  WebServiceResponse,
} from "@cuik/wallet/shared"
import {
  APPLE_PASS_CONTENT_TYPE,
  APPLE_PASS_DEFAULT_DESCRIPTION,
  APPLE_PASS_LOGO_TEXT,
  generateETag,
  loadAssetBuffer,
  resolvePassFields,
  resolveTemplate,
  validateAppleEnv,
} from "@cuik/wallet/shared"
import { clientIp } from "@/lib/client-ip"
import { formatExpiry } from "@/lib/loyalty/expiration"
import { nextExpiration } from "@/lib/loyalty/points-lots"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildStripImages } from "@/lib/wallet/points-strip"
import { passRelevantDate } from "@/lib/wallet/relevant-date"
import {
  type StampsConfigLike,
  safeAssetUrl,
  stripCompleted,
  stripLayoutFrom,
  stripMaxVisits,
} from "@/lib/wallet/strip-layout"
import { getTenantAppleConfig, resolveClientTenantId } from "@/lib/wallet/tenant-apple-config"

/**
 * Decode a credential that may be:
 * 1. Raw PEM text (starts with -----BEGIN)
 * 2. Base64-encoded PEM (decodes to -----BEGIN)
 * 3. Base64-encoded DER binary (wrap in PEM)
 */
function decodePemOrDer(input: string, type: string): string {
  if (input.startsWith("-----BEGIN")) {
    return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  }
  const raw = Buffer.from(input, "base64")
  const str = raw.toString("utf-8")
  if (str.startsWith("-----BEGIN")) {
    return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  }
  const b64Lines =
    raw
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n") ?? raw.toString("base64")
  return `-----BEGIN ${type}-----\n${b64Lines}\n-----END ${type}-----\n`
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─── Path Parsing ───────────────────────────────────────────────────────

type ParsedRoute =
  | {
      type: "registration"
      deviceLibId: string
      passTypeId: string
      serialNumber: string
    }
  | {
      type: "serials"
      deviceLibId: string
      passTypeId: string
    }
  | {
      type: "pass"
      passTypeId: string
      serialNumber: string
    }
  | { type: "log" }
  | { type: "unknown" }

function parsePath(rawSegments: string[]): ParsedRoute {
  // Next.js catch-all segments may be partially percent-encoded (e.g. %3A for ':').
  // Apple Wallet double-encodes serial numbers in URLs, so after Next.js decodes once
  // we still need to decode the remaining layer.
  const decode = (s: string) => decodeURIComponent(s)

  // Backward-compat: earlier builds shipped passes whose webServiceURL already ended
  // in "/v1". Apple then appends its own "/v1/devices/..." so we receive
  // [...path] = ["v1", "devices", ...]. Strip that redundant leading "v1" here so
  // those old passes keep registering and updating after the env-var fix.
  const segments = rawSegments[0] === "v1" ? rawSegments.slice(1) : rawSegments

  // POST/DELETE devices/{deviceLibId}/registrations/{passTypeId}/{serialNumber}
  // GET devices/{deviceLibId}/registrations/{passTypeId}
  if (segments[0] === "devices" && segments[2] === "registrations") {
    if (segments.length === 5) {
      return {
        type: "registration",
        deviceLibId: segments[1],
        passTypeId: segments[3],
        serialNumber: decode(segments[4]),
      }
    }
    if (segments.length === 4) {
      return {
        type: "serials",
        deviceLibId: segments[1],
        passTypeId: segments[3],
      }
    }
  }

  // GET passes/{passTypeId}/{serialNumber}
  if (segments[0] === "passes" && segments.length === 3) {
    return {
      type: "pass",
      passTypeId: segments[1],
      serialNumber: decode(segments[2]),
    }
  }

  // POST log
  if (segments[0] === "log") {
    return { type: "log" }
  }

  return { type: "unknown" }
}

// ─── WebServiceDeps Implementation (Drizzle) ───────────────────────────

/**
 * Resolve the Apple config for a pass identified by its serial number.
 * Looks up: serialNumber → pass_instances → clientId → clients.tenantId → tenant config.
 * Falls back to global env if tenant resolution fails.
 */
async function resolveAppleConfigForSerial(
  serialNumber: string,
): Promise<AppleWalletConfig | null> {
  const rows = await db
    .select({ clientId: passInstances.clientId })
    .from(passInstances)
    .where(eq(passInstances.serialNumber, serialNumber))
    .limit(1)

  const passInstance = rows[0]
  if (passInstance?.clientId) {
    const tenantId = await resolveClientTenantId(passInstance.clientId)
    if (tenantId) {
      return getTenantAppleConfig(tenantId)
    }
  }

  // Fallback to global config if we can't resolve the tenant
  return validateAppleEnv()
}

/**
 * Dual auth verification: try tenant-specific secret first, then global fallback.
 * This supports the migration period where old passes may use the global secret
 * while new passes use tenant-specific secrets.
 */
async function verifyAuthForSerial(serialNumber: string, token: string): Promise<boolean> {
  // 1. Try to resolve tenant-specific config
  const rows = await db
    .select({ clientId: passInstances.clientId })
    .from(passInstances)
    .where(eq(passInstances.serialNumber, serialNumber))
    .limit(1)

  const passInstance = rows[0]
  if (passInstance?.clientId) {
    const tenantId = await resolveClientTenantId(passInstance.clientId)
    if (tenantId) {
      const tenantConfig = await getTenantAppleConfig(tenantId)
      if (tenantConfig?.authSecret) {
        // Try tenant secret first
        if (verifyAuthToken(tenantConfig.authSecret, serialNumber, token)) {
          return true
        }
      }
    }
  }

  // 2. Fallback to global secret (for passes created before multi-tenant certs)
  const globalConfig = validateAppleEnv()
  if (globalConfig?.authSecret) {
    return verifyAuthToken(globalConfig.authSecret, serialNumber, token)
  }

  return false
}

function buildDeps(): WebServiceDeps {
  return {
    findDeviceRegistration: async (deviceLibId: string, serialNumber: string) => {
      const rows = await db
        .select({ pushToken: appleDevices.pushToken })
        .from(appleDevices)
        .where(
          and(
            eq(appleDevices.deviceLibId, deviceLibId),
            eq(appleDevices.serialNumber, serialNumber),
          ),
        )
        .limit(1)

      return rows[0] ?? null
    },

    insertDeviceRegistration: async (
      deviceLibId: string,
      passTypeId: string,
      serialNumber: string,
      pushToken: string,
    ) => {
      // Upsert: insert or update pushToken on conflict
      await db
        .insert(appleDevices)
        .values({
          deviceLibId,
          passTypeId,
          serialNumber,
          pushToken,
        })
        .onConflictDoUpdate({
          target: [appleDevices.deviceLibId, appleDevices.serialNumber],
          set: { pushToken },
        })
      // The pass is on a device again: clear the removal mark.
      await db
        .update(passInstances)
        .set({ appleRemovedAt: null })
        .where(eq(passInstances.serialNumber, serialNumber))
    },

    deleteDeviceRegistration: async (deviceLibId: string, serialNumber: string) => {
      await db
        .delete(appleDevices)
        .where(
          and(
            eq(appleDevices.deviceLibId, deviceLibId),
            eq(appleDevices.serialNumber, serialNumber),
          ),
        )
      // Last device gone: record when the pass stopped being installed, so a
      // removed pass is distinguishable from one that was never added.
      const [remaining] = await db
        .select({ n: count() })
        .from(appleDevices)
        .where(eq(appleDevices.serialNumber, serialNumber))
      if ((remaining?.n ?? 0) === 0) {
        await db
          .update(passInstances)
          .set({ appleRemovedAt: new Date() })
          .where(eq(passInstances.serialNumber, serialNumber))
      }
    },

    getSerialsForDevice: async (
      deviceLibId: string,
      passTypeId: string,
      _updatedSince?: string,
    ) => {
      // Join apple_devices with pass_instances to filter by updatedSince
      const rows = await db
        .select({
          serialNumber: appleDevices.serialNumber,
          lastUpdatedAt: passInstances.lastUpdatedAt,
        })
        .from(appleDevices)
        .leftJoin(passInstances, eq(appleDevices.serialNumber, passInstances.serialNumber))
        .where(
          and(eq(appleDevices.deviceLibId, deviceLibId), eq(appleDevices.passTypeId, passTypeId)),
        )

      console.info(
        `[Wallet:Serials] query deviceLibId=${deviceLibId.slice(0, 8)}... passTypeId=${passTypeId}`,
        `updatedSince=${_updatedSince ?? "none"}`,
        `rowsFound=${rows.length}`,
        `serials=${JSON.stringify(rows.map((r) => ({ s: r.serialNumber, updAt: r.lastUpdatedAt?.toISOString() ?? "NULL" })))}`,
      )

      let filtered = rows
      if (_updatedSince) {
        const sinceDate = new Date(_updatedSince)
        if (!Number.isNaN(sinceDate.getTime())) {
          filtered = rows.filter((r) => r.lastUpdatedAt && r.lastUpdatedAt > sinceDate)
          console.info(
            `[Wallet:Serials] filter sinceDate=${sinceDate.toISOString()}`,
            `beforeFilter=${rows.length} afterFilter=${filtered.length}`,
            `nullLastUpdated=${rows.filter((r) => !r.lastUpdatedAt).length}`,
          )
        }
      }

      const serialNumbers = filtered.map((r) => r.serialNumber).filter(Boolean)

      const maxDate = filtered.reduce<Date | null>((max, r) => {
        if (!r.lastUpdatedAt) return max
        if (!max) return r.lastUpdatedAt
        return r.lastUpdatedAt > max ? r.lastUpdatedAt : max
      }, null)

      const result = {
        serialNumbers,
        lastUpdated: maxDate?.toISOString() ?? new Date().toISOString(),
      }

      console.info(
        `[Wallet:Serials] result status=${serialNumbers.length > 0 ? 200 : 204}`,
        `returnCount=${serialNumbers.length} lastUpdated=${result.lastUpdated}`,
      )

      return result
    },

    getPassInstance: async (serialNumber: string) => {
      const rows = await db
        .select({
          authToken: passInstances.authToken,
          lastUpdatedAt: passInstances.lastUpdatedAt,
          etag: passInstances.etag,
          clientId: passInstances.clientId,
          designId: passInstances.designId,
          campaignMessage: passInstances.campaignMessage,
        })
        .from(passInstances)
        .where(eq(passInstances.serialNumber, serialNumber))
        .limit(1)

      const row = rows[0]
      if (!row || !row.authToken) return null

      return {
        authToken: row.authToken,
        lastUpdatedAt: row.lastUpdatedAt,
        etag: row.etag,
        clientId: row.clientId,
        designId: row.designId,
        campaignMessage: row.campaignMessage,
      }
    },

    verifyAuthToken: (serialNumber: string, token: string) => {
      // Note: this synchronous version is kept for the WebServiceDeps interface.
      // The actual dual verification is done in the route handlers before calling
      // handleGetPass/handleRegisterDevice/handleUnregisterDevice.
      // This fallback uses global secret only — the route handlers do the full
      // dual verification via verifyAuthForSerial() before reaching here.
      const globalConfig = validateAppleEnv()
      if (!globalConfig?.authSecret) return false
      return verifyAuthToken(globalConfig.authSecret, serialNumber, token)
    },
  }
}

// ─── Auth Token Extraction ──────────────────────────────────────────────

/**
 * Extract the auth token from the Apple Wallet "ApplePass {token}" header.
 */
function extractAuthToken(authHeader: string): string | null {
  const match = authHeader.match(/^ApplePass\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Build deps with a pre-verified auth token.
 * After async dual verification succeeds, we pass deps where verifyAuthToken
 * always returns true for the already-verified serial, so the sync wallet
 * handler accepts it without re-checking.
 */
function buildPreVerifiedDeps(verifiedSerial: string): WebServiceDeps {
  const deps = buildDeps()
  return {
    ...deps,
    verifyAuthToken: (serialNumber: string, _token: string) => {
      // Only pass through if this is the serial we already verified
      return serialNumber === verifiedSerial
    },
  }
}

// ─── Response Builder ───────────────────────────────────────────────────

function toResponse(result: WebServiceResponse): Response {
  const headers = new Headers(result.headers ?? {})
  headers.set("Cache-Control", "no-store")

  if (result.body !== undefined && result.body !== null) {
    headers.set("Content-Type", "application/json")
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers,
    })
  }

  return new Response(null, { status: result.status, headers })
}

// ─── Log endpoint limits ────────────────────────────────────────────────

/** POST /v1/log bodies above this are rejected with 413. */
const LOG_MAX_BODY_BYTES = 16 * 1024
/** POST /v1/log requests allowed per IP per window. */
const LOG_RATE_LIMIT = 30
const LOG_RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Read the request body as text, giving up (null) as soon as it exceeds
 * maxBytes — a declared Content-Length over the cap is rejected unread.
 */
async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf-8")
}

// ─── Route Handlers ─────────────────────────────────────────────────────

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params
    const route = parsePath(segments)
    console.log(
      `[Wallet:AppleWSP] GET segments=${JSON.stringify(segments)} routeType=${route.type}`,
    )

    if (route.type === "serials") {
      // No auth required for serial listing (Apple spec)
      const deps = buildDeps()
      const url = new URL(request.url)
      const updatedSince = url.searchParams.get("passesUpdatedSince") ?? undefined

      const result = await handleGetSerials(deps, {
        deviceLibId: route.deviceLibId,
        passTypeId: route.passTypeId,
        updatedSince,
      })

      console.info(
        `[Wallet:Serials:Response] status=${result.status}`,
        `body=${result.body ? JSON.stringify(result.body) : "none"}`,
        `url=${url.pathname}`,
      )

      return toResponse(result)
    }

    if (route.type === "pass") {
      const authHeader = request.headers.get("authorization") ?? ""
      const ifNoneMatch = request.headers.get("if-none-match") ?? undefined
      const ifModifiedSince = request.headers.get("if-modified-since") ?? undefined

      console.info(
        `[Wallet:GetPass] serial=${route.serialNumber} passTypeId=${route.passTypeId}`,
        `ifNoneMatch=${ifNoneMatch ?? "none"} ifModifiedSince=${ifModifiedSince ?? "none"}`,
        `hasAuth=${authHeader ? "yes" : "no"}`,
      )

      // Dual auth verification: try tenant secret first, then global fallback
      const token = extractAuthToken(authHeader)
      if (!token) {
        console.warn(`[Wallet:GetPass] 401 no token serial=${route.serialNumber}`)
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      const isAuthed = await verifyAuthForSerial(route.serialNumber, token)
      if (!isAuthed) {
        console.warn(
          `[Wallet:GetPass] 401 bad token serial=${route.serialNumber} token=${token.slice(0, 8)}...`,
        )
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      // Use pre-verified deps so the handler skips its internal sync check
      const deps = buildPreVerifiedDeps(route.serialNumber)
      // Before any DB read: bounds the Last-Modified we announce (lastModifiedHeader).
      const requestStartedAt = new Date()

      const result = await handleGetPass(deps, {
        passTypeId: route.passTypeId,
        serialNumber: route.serialNumber,
        authHeader,
        ifNoneMatch,
        ifModifiedSince,
      })

      // 304 or error — return directly
      if (result.status !== 200) {
        console.info(
          `[Wallet:GetPass] serial=${route.serialNumber} status=${result.status}`,
          `headers=${JSON.stringify(result.headers ?? {})}`,
          result.status === 304 ? "(304 Not Modified — iPhone has latest version)" : "(error)",
        )
        return toResponse(result)
      }

      // 200 — the handler signals that we need to regenerate the .pkpass
      const passData = (
        result.body as {
          passInstance: {
            clientId: string
            designId: string
            campaignMessage?: string | null
            lastUpdatedAt?: Date | null
          }
        }
      )?.passInstance
      if (!passData) {
        console.error(
          `[Wallet:GetPass] serial=${route.serialNumber} status=500 (no passData in handleGetPass result)`,
        )
        return new Response("Internal Server Error", { status: 500 })
      }

      // Resolve tenant-specific Apple config for pass regeneration
      const appleConfigForPass = await resolveAppleConfigForSerial(route.serialNumber)
      if (!appleConfigForPass) {
        console.error(
          `[Wallet:GetPass] serial=${route.serialNumber} status=503 (apple config not resolved)`,
        )
        return new Response("Apple Wallet not configured", { status: 503 })
      }

      // Regenerate .pkpass with tenant-specific config
      const regenerated = await regeneratePass({
        clientId: passData.clientId,
        designId: passData.designId,
        serialNumber: route.serialNumber,
        appleConfig: appleConfigForPass,
        campaignMessage: passData.campaignMessage ?? null,
        lastUpdatedAt: passData.lastUpdatedAt ?? null,
        requestStartedAt,
      })

      if (!regenerated) {
        console.error(
          `[Wallet:GetPass] serial=${route.serialNumber} status=500 (regeneratePass returned null)`,
        )
        return new Response("Failed to regenerate pass", { status: 500 })
      }

      // Last-Modified is the last_updated_at read BEFORE generating (never "now"):
      // the device sends it back as If-Modified-Since and gets a 304 until a
      // visit/redeem/campaign bumps last_updated_at again. If a change lands
      // while we generate, its newer timestamp still triggers a fresh fetch.
      const passBuffer = regenerated.buffer
      const freshEtag = regenerated.etag
      const freshLastUpdated = regenerated.lastUpdatedAt

      // Convert Node.js Buffer to Uint8Array so the Web Response API
      // transmits raw bytes instead of a UTF-8-mangled string.
      const body =
        passBuffer instanceof Uint8Array && !(passBuffer instanceof Buffer)
          ? passBuffer
          : new Uint8Array(passBuffer)

      const responseHeaders = new Headers(result.headers ?? {})
      responseHeaders.set("Content-Type", APPLE_PASS_CONTENT_TYPE)
      responseHeaders.set("Content-Encoding", "identity")
      responseHeaders.set("Content-Length", String(body.byteLength))
      responseHeaders.set("Cache-Control", "no-store, no-transform")
      const lastModified = lastModifiedHeader(freshLastUpdated, requestStartedAt)
      responseHeaders.set("Last-Modified", lastModified)
      responseHeaders.set("ETag", freshEtag)

      console.info(
        `[Wallet:GetPass] serial=${route.serialNumber} status=200`,
        `size=${body.byteLength} etag=${freshEtag}`,
        `lastModified=${lastModified}`,
      )

      return new Response(body, {
        status: 200,
        headers: responseHeaders,
      })
    }

    console.warn(`[Wallet:AppleWSP] GET 404 unmatched route`, { segments, routeType: route.type })
    return new Response("Not Found", { status: 404 })
  } catch (err) {
    console.error("[Wallet:AppleWSP] GET error:", err)
    return new Response("Server Error", { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params
    const route = parsePath(segments)
    console.log(
      `[Wallet:AppleWSP] POST segments=${JSON.stringify(segments)} routeType=${route.type}`,
    )

    if (route.type === "registration") {
      let pushToken = ""
      try {
        const body = await request.json()
        pushToken = String(
          (body as Record<string, unknown>)?.pushToken ??
            (body as Record<string, unknown>)?.push_token ??
            "",
        ).trim()
      } catch {
        // Try form data or text
        const text = await request.text().catch(() => "")
        if (text) {
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>
            pushToken = String(parsed?.pushToken ?? parsed?.push_token ?? "").trim()
          } catch {
            // no valid body
          }
        }
      }

      const authHeader = request.headers.get("authorization") ?? ""

      // Dual auth verification before calling handler
      const token = extractAuthToken(authHeader)
      if (!token) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      const isAuthed = await verifyAuthForSerial(route.serialNumber, token)
      if (!isAuthed) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      const deps = buildPreVerifiedDeps(route.serialNumber)

      const result = await handleRegisterDevice(deps, {
        deviceLibId: route.deviceLibId,
        passTypeId: route.passTypeId,
        serialNumber: route.serialNumber,
        pushToken,
        authHeader,
      })
      return toResponse(result)
    }

    if (route.type === "log") {
      // Unauthenticated endpoint: limit per IP and cap the body before parsing.
      if (
        !checkRateLimit(`apple-log:ip:${clientIp(request)}`, LOG_RATE_LIMIT, LOG_RATE_WINDOW_MS)
      ) {
        return new Response(null, { status: 429, headers: { "Cache-Control": "no-store" } })
      }
      const text = await readCappedText(request, LOG_MAX_BODY_BYTES)
      if (text === null) {
        return new Response(null, { status: 413, headers: { "Cache-Control": "no-store" } })
      }
      let body: unknown = null
      try {
        body = JSON.parse(text)
      } catch {
        // ignore parse errors
      }
      // handleLog keeps at most 20 entries of 500 characters each.
      const result = handleLog(body)
      return toResponse(result)
    }

    return new Response("Not Found", { status: 404 })
  } catch (err) {
    console.error("[Wallet:AppleWSP] POST error:", err)
    return new Response("Server Error", { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params
    const route = parsePath(segments)
    console.log(
      `[Wallet:AppleWSP] DELETE segments=${JSON.stringify(segments)} routeType=${route.type}`,
    )

    if (route.type === "registration") {
      const authHeader = request.headers.get("authorization") ?? ""

      // Dual auth verification before calling handler
      const token = extractAuthToken(authHeader)
      if (!token) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      const isAuthed = await verifyAuthForSerial(route.serialNumber, token)
      if (!isAuthed) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      const deps = buildPreVerifiedDeps(route.serialNumber)

      const result = await handleUnregisterDevice(deps, {
        deviceLibId: route.deviceLibId,
        serialNumber: route.serialNumber,
        authHeader,
      })
      return toResponse(result)
    }

    return new Response("Not Found", { status: 404 })
  } catch (err) {
    console.error("[Wallet:AppleWSP] DELETE error:", err)
    return new Response("Server Error", { status: 500 })
  }
}

// ─── Pass Regeneration Helper ──────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential Apple pass regeneration with asset loading, strip composition, field resolution, campaign injection, and signing — tightly coupled flow
async function regeneratePass(ctx: {
  clientId: string
  designId: string
  serialNumber: string
  appleConfig: AppleWalletConfig
  campaignMessage: string | null
  /** pass_instances.last_updated_at as read before generating. */
  lastUpdatedAt: Date | null
  /** Taken before reading the pass; becomes last_updated_at when it was null. */
  requestStartedAt: Date
}): Promise<{ buffer: Buffer; etag: string; lastUpdatedAt: Date } | null> {
  try {
    const { clientId, designId, serialNumber, appleConfig, campaignMessage } = ctx

    // Fetch client
    const clientRows = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)

    const client = clientRows[0]
    if (!client) return null

    // Fetch design
    const designRows = await db
      .select()
      .from(passDesigns)
      .where(eq(passDesigns.id, designId))
      .limit(1)

    const design = designRows[0]
    if (!design) return null

    // Program type decides how the strip is built (points: background only).
    const [activePromo] = await db
      .select({ type: promotions.type, maxVisits: promotions.maxVisits })
      .from(promotions)
      .where(and(eq(promotions.tenantId, design.tenantId), eq(promotions.active, true)))
      .limit(1)

    // Fetch assets
    const assetRows = await db.select().from(passAssets).where(eq(passAssets.designId, designId))

    const assetMap = new Map<string, PassAssetData>()
    for (const asset of assetRows) {
      assetMap.set(asset.type, asset as unknown as PassAssetData)
    }

    const iconAsset = assetMap.get("icon")
    if (!iconAsset) return null

    // Calculate stamp state
    const stampsConfig = design.stampsConfig as StampsConfigLike | null
    // Visits per card: the promotion's (what visits count against), else the design's.
    const maxVisits = stripMaxVisits(activePromo, stampsConfig)
    const stampsInCycle = client.totalVisits % maxVisits
    // A completed card whose reward is still pending is drawn full, not empty.
    const pendingRewardRows = await db
      .select({ cnt: count() })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, client.tenantId),
          eq(rewards.status, "pending"),
        ),
      )
    const completed = stripCompleted(
      stampsInCycle,
      Number(pendingRewardRows[0]?.cnt ?? 0),
      client.totalVisits,
    )

    // Generate auth token
    const authToken = generateAuthToken(appleConfig.authSecret, serialNumber)

    // Load assets
    const stripBgUrl = assetMap.get("strip_bg")?.url
    const stampUrl = assetMap.get("stamp")?.url
    const specialStampUrl = safeAssetUrl(stampsConfig?.specialStampUrl)
    const [iconBuffer, stripBgBuffer, stampBuffer, specialStampBuffer] = await Promise.all([
      loadAssetBuffer(iconAsset.url),
      stripBgUrl ? loadAssetBuffer(stripBgUrl) : null,
      stampUrl ? loadAssetBuffer(stampUrl) : null,
      specialStampUrl ? loadAssetBuffer(specialStampUrl).catch(() => null) : null,
    ])

    // Points passes: background only (no stamp grid). Stamps: grid as before.
    // Real MIME sniffed from the bytes (a JPG used to be labelled PNG). See lib/wallet/points-strip.ts.
    const { strip2x: stripImage2x, strip1x: stripImage1x } = await buildStripImages({
      programType: activePromo?.type === "points" ? "points" : "stamps",
      background: stripBgBuffer,
      stamp: stampBuffer,
      stampsInCycle,
      maxVisits,
      gridLayout: stripLayoutFrom(stampsConfig),
      specialStamp: specialStampBuffer,
      completed,
    })

    const logoAsset = assetMap.get("logo")
    const logoBuffer = logoAsset ? await loadAssetBuffer(logoAsset.url) : undefined

    // Colors
    const colors = design.colors as {
      backgroundColor?: string
      foregroundColor?: string
      labelColor?: string
    } | null

    // Pending rewards (counted above, before the strip)
    const pendingRewards = Number(pendingRewardRows[0]?.cnt ?? 0)

    // Resolve dynamic design fields (if configured)
    const designFieldsConfig = design.fields as {
      headerFields?: Array<{ key: string; label: string; value: string }>
      secondaryFields?: Array<{ key: string; label: string; value: string }>
      backFields?: Array<{ key: string; label: string; value: string }>
    } | null

    // Fetch tenant name + wallet config (used for organizationName, template context, locations)
    const [tenantRow] = await db
      .select({
        name: tenants.name,
        walletConfig: tenants.walletConfig,
        timezone: tenants.timezone,
      })
      .from(tenants)
      .where(eq(tenants.id, client.tenantId))
      .limit(1)

    // Soonest points expiry, for {{points.expiring}} / {{points.expiresAt}}.
    // Any failure here must never block the pass: fall back to "no expiry".
    let upcoming: { amount: number; expiresAt: Date } | null = null
    if (activePromo?.type === "points") {
      try {
        upcoming = await nextExpiration(db, client.id)
      } catch (err) {
        console.warn("[Apple:Pass] nextExpiration failed, rendering without expiry:", err)
      }
    }

    // Parse wallet config for locations and relevantDate
    const walletConfig = tenantRow?.walletConfig as {
      locations?: Array<{ lat: number; lng: number; name: string; relevantText?: string }>
      relevantDateEnabled?: boolean
    } | null

    const locations =
      walletConfig?.locations?.map((loc) => {
        const text = (loc.relevantText ?? loc.name ?? "").trim()
        return {
          latitude: Number(loc.lat),
          longitude: Number(loc.lng),
          ...(text ? { relevantText: text } : {}),
        }
      }) ?? []

    // Get nearest pending reward expiresAt for relevantDate
    const relevantDate = await passRelevantDate({
      enabled: walletConfig?.relevantDateEnabled,
      clientId: client.id,
      tenantId: client.tenantId,
      promotionType: activePromo?.type,
      pendingRewards: Number(pendingRewards),
    })

    const templateContext: TemplateContext = {
      client: {
        name: client.name,
        lastName: client.lastName,
        phone: client.phone,
        email: client.email,
        birthday: (client.birthday as string | null) ?? null,
        tier: client.tier,
        totalVisits: client.totalVisits,
        pointsBalance: client.pointsBalance,
        customData: (client.customData as Record<string, unknown> | null) ?? null,
      },
      stamps: {
        // A completed card with its reward pending is drawn full: say so in the text too.
        current: completed ? maxVisits : stampsInCycle,
        max: maxVisits,
        remaining: completed ? 0 : maxVisits - stampsInCycle,
        total: client.totalVisits,
      },
      points: {
        balance: client.pointsBalance,
        expiring: upcoming ? upcoming.amount : "",
        expiresAt: upcoming
          ? formatExpiry(upcoming.expiresAt, tenantRow?.timezone ?? "America/Lima")
          : "",
      },
      rewards: {
        pending: pendingRewards,
      },
      tenant: {
        name: tenantRow?.name ?? "Cuik",
      },
    }

    let resolvedDesignFields: ReturnType<typeof resolvePassFields> | undefined
    if (
      designFieldsConfig &&
      (designFieldsConfig.headerFields?.length ||
        designFieldsConfig.secondaryFields?.length ||
        designFieldsConfig.backFields?.length)
    ) {
      resolvedDesignFields = resolvePassFields(designFieldsConfig, templateContext)
    }

    // Inject campaign message as a backField if present, or strip stale "campaign" key if cleared
    if (campaignMessage) {
      const resolvedMessage = resolveTemplate(campaignMessage, templateContext)
      if (resolvedDesignFields) {
        resolvedDesignFields.backFields = [
          { key: "campaign", label: "Mensaje", value: resolvedMessage, changeMessage: "%@" },
          ...resolvedDesignFields.backFields,
        ]
      } else {
        resolvedDesignFields = {
          headerFields: [],
          secondaryFields: [],
          backFields: [
            { key: "campaign", label: "Mensaje", value: resolvedMessage, changeMessage: "%@" },
          ],
        }
      }
    } else if (resolvedDesignFields) {
      // Campaign message was cleared (wallet_update) — ensure no stale "campaign" backField remains
      resolvedDesignFields.backFields = resolvedDesignFields.backFields.filter(
        (f) => f.key !== "campaign",
      )
    }

    const passResult = await createApplePass({
      teamId: appleConfig.teamId,
      passTypeId: appleConfig.passTypeId,
      serialNumber,
      authToken,
      webServiceUrl: appleConfig.webServiceUrl,
      signerCert: decodePemOrDer(appleConfig.signerCertBase64, "CERTIFICATE"),
      signerKey: decodePemOrDer(appleConfig.signerKeyBase64, "RSA PRIVATE KEY"),
      signerKeyPassphrase: appleConfig.signerKeyPassphrase,
      wwdr: decodePemOrDer(appleConfig.wwdrBase64, "CERTIFICATE"),
      organizationName: tenantRow?.name ?? "Cuik",
      description: APPLE_PASS_DEFAULT_DESCRIPTION,
      logoText: APPLE_PASS_LOGO_TEXT,
      colors: {
        background: colors?.backgroundColor ?? "rgb(26,26,46)",
        foreground: colors?.foregroundColor ?? "rgb(255,255,255)",
        label: colors?.labelColor ?? "rgb(224,224,224)",
      },
      clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
      stampsInCycle,
      maxVisits,
      totalVisits: client.totalVisits,
      pendingRewards,
      qrMessage: serialNumber,
      stripImage2x,
      stripImage1x,
      logo: logoBuffer,
      icon: iconBuffer,
      designFields: resolvedDesignFields,
      locations: locations.length > 0 ? locations : undefined,
      relevantDate,
      expired: client.status === "deleted",
    })

    if (!passResult.ok) {
      console.error("[Wallet:AppleWSP] Pass regeneration failed:", passResult.error)
      return null
    }

    // Serving a pass is not a change: keep last_updated_at as it was so
    // Last-Modified / If-Modified-Since stay stable (it used to be bumped to
    // "now" on every fetch, so a 304 never happened). Only a pass that never
    // had a timestamp gets one. The ETag is derived from that same timestamp
    // and only written while last_updated_at is still the value we read, so a
    // concurrent visit's newer ETag is never overwritten with an older one.
    // A first timestamp is the request start (not "now"): a change landing while
    // we generate is then newer, never hidden behind our Last-Modified.
    const lastUpdatedAt = ctx.lastUpdatedAt ?? ctx.requestStartedAt
    const etag = generateETag(serialNumber, client.totalVisits, lastUpdatedAt)
    await db
      .update(passInstances)
      .set(ctx.lastUpdatedAt ? { etag } : { etag, lastUpdatedAt })
      .where(
        and(
          eq(passInstances.serialNumber, serialNumber),
          ctx.lastUpdatedAt
            ? eq(passInstances.lastUpdatedAt, ctx.lastUpdatedAt)
            : isNull(passInstances.lastUpdatedAt),
        ),
      )

    return { buffer: passResult.buffer, etag, lastUpdatedAt }
  } catch (err) {
    console.error("[Wallet:AppleWSP] regeneratePass error:", err)
    return null
  }
}
