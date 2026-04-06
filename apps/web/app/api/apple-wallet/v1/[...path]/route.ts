import {
  and,
  appleDevices,
  asc,
  clients,
  count,
  db,
  eq,
  passAssets,
  passDesigns,
  passInstances,
  rewards,
  tenants,
} from "@cuik/db"
import {
  createApplePass,
  generateAuthToken,
  generateStripImage,
  handleGetPass,
  handleGetSerials,
  handleLog,
  handleRegisterDevice,
  handleUnregisterDevice,
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
import sharp from "sharp"
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

function parsePath(segments: string[]): ParsedRoute {
  // Next.js catch-all segments may be partially percent-encoded (e.g. %3A for ':').
  // Apple Wallet double-encodes serial numbers in URLs, so after Next.js decodes once
  // we still need to decode the remaining layer.
  const decode = (s: string) => decodeURIComponent(s)

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

      let filtered = rows
      if (_updatedSince) {
        const sinceDate = new Date(_updatedSince)
        if (!Number.isNaN(sinceDate.getTime())) {
          filtered = rows.filter((r) => r.lastUpdatedAt && r.lastUpdatedAt > sinceDate)
        }
      }

      const serialNumbers = filtered.map((r) => r.serialNumber).filter(Boolean)

      const maxDate = filtered.reduce<Date | null>((max, r) => {
        if (!r.lastUpdatedAt) return max
        if (!max) return r.lastUpdatedAt
        return r.lastUpdatedAt > max ? r.lastUpdatedAt : max
      }, null)

      return {
        serialNumbers,
        lastUpdated: maxDate?.toISOString() ?? new Date().toISOString(),
      }
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

// ─── Route Handlers ─────────────────────────────────────────────────────

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params
    const route = parsePath(segments)

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
      return toResponse(result)
    }

    if (route.type === "pass") {
      const authHeader = request.headers.get("authorization") ?? ""
      const ifNoneMatch = request.headers.get("if-none-match") ?? undefined
      const ifModifiedSince = request.headers.get("if-modified-since") ?? undefined

      // Dual auth verification: try tenant secret first, then global fallback
      const token = extractAuthToken(authHeader)
      if (!token) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      const isAuthed = await verifyAuthForSerial(route.serialNumber, token)
      if (!isAuthed) {
        return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } })
      }

      // Use pre-verified deps so the handler skips its internal sync check
      const deps = buildPreVerifiedDeps(route.serialNumber)

      const result = await handleGetPass(deps, {
        passTypeId: route.passTypeId,
        serialNumber: route.serialNumber,
        authHeader,
        ifNoneMatch,
        ifModifiedSince,
      })

      // 304 or error — return directly
      if (result.status !== 200) {
        return toResponse(result)
      }

      // 200 — the handler signals that we need to regenerate the .pkpass
      const passData = (
        result.body as {
          passInstance: { clientId: string; designId: string; campaignMessage?: string | null }
        }
      )?.passInstance
      if (!passData) {
        return new Response("Internal Server Error", { status: 500 })
      }

      // Resolve tenant-specific Apple config for pass regeneration
      const appleConfigForPass = await resolveAppleConfigForSerial(route.serialNumber)
      if (!appleConfigForPass) {
        return new Response("Apple Wallet not configured", { status: 503 })
      }

      // Regenerate .pkpass with tenant-specific config
      const passBuffer = await regeneratePass({
        clientId: passData.clientId,
        designId: passData.designId,
        serialNumber: route.serialNumber,
        appleConfig: appleConfigForPass,
        campaignMessage: passData.campaignMessage ?? null,
      })

      if (!passBuffer) {
        return new Response("Failed to regenerate pass", { status: 500 })
      }

      // Read back the etag + lastUpdatedAt that regeneratePass wrote to the DB
      const updatedInstance = await db
        .select({ etag: passInstances.etag, lastUpdatedAt: passInstances.lastUpdatedAt })
        .from(passInstances)
        .where(eq(passInstances.serialNumber, route.serialNumber))
        .limit(1)

      const freshEtag = updatedInstance[0]?.etag ?? generateETag(route.serialNumber, 0, new Date())
      const freshLastUpdated = updatedInstance[0]?.lastUpdatedAt ?? new Date()

      const responseHeaders = new Headers(result.headers ?? {})
      responseHeaders.set("Content-Type", APPLE_PASS_CONTENT_TYPE)
      responseHeaders.set("Cache-Control", "no-store")
      responseHeaders.set("Last-Modified", freshLastUpdated.toUTCString())
      responseHeaders.set("ETag", freshEtag)

      return new Response(passBuffer, {
        status: 200,
        headers: responseHeaders,
      })
    }

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
      let body: unknown = null
      try {
        body = await request.json()
      } catch {
        // ignore parse errors
      }
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
}): Promise<Buffer | null> {
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

    // Fetch assets
    const assetRows = await db.select().from(passAssets).where(eq(passAssets.designId, designId))

    const assetMap = new Map<string, PassAssetData>()
    for (const asset of assetRows) {
      assetMap.set(asset.type, asset as unknown as PassAssetData)
    }

    const iconAsset = assetMap.get("icon")
    if (!iconAsset) return null

    // Calculate stamp state
    const stampsConfig = design.stampsConfig as {
      maxVisits: number
      gridCols?: number
      gridRows?: number
      stampSize?: number
      offsetX?: number
      offsetY?: number
      gapX?: number
      gapY?: number
      filledOpacity?: number
      emptyOpacity?: number
      rowOffsets?: Array<{ x: number; y: number }>
    } | null
    const maxVisits = stampsConfig?.maxVisits ?? 8
    const stampsInCycle = client.totalVisits % maxVisits

    // Generate auth token
    const authToken = generateAuthToken(appleConfig.authSecret, serialNumber)

    // Load assets
    const stripBgUrl = assetMap.get("strip_bg")?.url
    const stampUrl = assetMap.get("stamp")?.url
    const [iconBuffer, stripBgBuffer, stampBuffer] = await Promise.all([
      loadAssetBuffer(iconAsset.url),
      stripBgUrl ? loadAssetBuffer(stripBgUrl) : null,
      stampUrl ? loadAssetBuffer(stampUrl) : null,
    ])

    let stripImage2x: Buffer
    let stripImage1x: Buffer

    if (stripBgBuffer && stampBuffer) {
      const bgDataUri = `data:image/png;base64,${stripBgBuffer.toString("base64")}`
      const stampDataUri = `data:image/png;base64,${stampBuffer.toString("base64")}`

      const stripResult = await generateStripImage({
        backgroundImageDataUri: bgDataUri,
        stampImageDataUri: stampDataUri,
        stampsInCycle,
        maxVisits,
        gridLayout: stampsConfig
          ? {
              cols: stampsConfig.gridCols ?? 4,
              rows: stampsConfig.gridRows ?? 2,
              stampSize: stampsConfig.stampSize ?? 63,
              offsetX: stampsConfig.offsetX ?? 197,
              offsetY: stampsConfig.offsetY ?? 23,
              gapX: stampsConfig.gapX ?? 98,
              gapY: stampsConfig.gapY ?? 73,
              filledOpacity: stampsConfig.filledOpacity ?? 1,
              emptyOpacity: stampsConfig.emptyOpacity ?? 0.35,
              rowOffsets: stampsConfig.rowOffsets,
            }
          : undefined,
      })
      stripImage2x = stripResult.strip2x
      stripImage1x = stripResult.strip1x
    } else {
      stripImage2x = await sharp({
        create: {
          width: 750,
          height: 246,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer()
      stripImage1x = await sharp({
        create: {
          width: 375,
          height: 123,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer()
    }

    const logoAsset = assetMap.get("logo")
    const logoBuffer = logoAsset ? await loadAssetBuffer(logoAsset.url) : undefined

    // Colors
    const colors = design.colors as {
      backgroundColor?: string
      foregroundColor?: string
      labelColor?: string
    } | null

    // Pending rewards
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
    const pendingRewards = Number(pendingRewardRows[0]?.cnt ?? 0)

    // Resolve dynamic design fields (if configured)
    const designFieldsConfig = design.fields as {
      headerFields?: Array<{ key: string; label: string; value: string }>
      secondaryFields?: Array<{ key: string; label: string; value: string }>
      backFields?: Array<{ key: string; label: string; value: string }>
    } | null

    // Fetch tenant name + wallet config (used for organizationName, template context, locations)
    const [tenantRow] = await db
      .select({ name: tenants.name, walletConfig: tenants.walletConfig })
      .from(tenants)
      .where(eq(tenants.id, client.tenantId))
      .limit(1)

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
    let relevantDate: Date | undefined
    if (walletConfig?.relevantDateEnabled && pendingRewards > 0) {
      const [nearestReward] = await db
        .select({ expiresAt: rewards.expiresAt })
        .from(rewards)
        .where(
          and(
            eq(rewards.clientId, client.id),
            eq(rewards.tenantId, client.tenantId),
            eq(rewards.status, "pending"),
          ),
        )
        .orderBy(asc(rewards.expiresAt))
        .limit(1)
      if (nearestReward?.expiresAt) {
        relevantDate = nearestReward.expiresAt
      }
    }

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
        current: stampsInCycle,
        max: maxVisits,
        remaining: maxVisits - stampsInCycle,
        total: client.totalVisits,
      },
      points: {
        balance: client.pointsBalance,
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
    })

    if (!passResult.ok) {
      console.error("[Wallet:AppleWSP] Pass regeneration failed:", passResult.error)
      return null
    }

    // Update pass_instances with new etag
    const now = new Date()
    const etag = generateETag(serialNumber, client.totalVisits, now)
    await db
      .update(passInstances)
      .set({ etag, lastUpdatedAt: now })
      .where(eq(passInstances.serialNumber, serialNumber))

    return passResult.buffer
  } catch (err) {
    console.error("[Wallet:AppleWSP] regeneratePass error:", err)
    return null
  }
}
