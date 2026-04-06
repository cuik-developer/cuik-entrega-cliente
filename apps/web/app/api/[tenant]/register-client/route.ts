import {
  and,
  clients,
  db,
  eq,
  passAssets,
  passDesigns,
  passInstances,
  pointsTransactions,
  promotions,
  visits,
} from "@cuik/db"
import type { RegistrationConfig } from "@cuik/shared/validators"
import {
  buildRegistrationSchema,
  registerClientSchema,
  registrationConfigSchema,
} from "@cuik/shared/validators"
import { generateAuthToken } from "@cuik/wallet/apple"
import {
  buildGoogleClassId,
  buildSaveToWalletUrl,
  ensureLoyaltyClass,
  getGoogleAccessToken,
  upsertLoyaltyObject,
} from "@cuik/wallet/google"
import { resolvePassFields, type TemplateContext, validateGoogleEnv } from "@cuik/wallet/shared"
import { errorResponse, resolveTenant, successResponse } from "@/lib/api-utils"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"

// ── Registration helpers ─────────────────────────────────────────────

function parseRegistrationConfig(tenant: { registrationConfig: unknown }) {
  if (!tenant.registrationConfig) return null
  const configParsed = registrationConfigSchema.safeParse(tenant.registrationConfig)
  return configParsed.success ? configParsed.data : null
}

async function checkDniUniqueness(tenantId: string, dni: string | undefined) {
  if (!dni) return null
  const existingClient = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.dni, dni)))
    .limit(1)

  if (existingClient.length > 0) {
    return errorResponse("Client with this DNI already exists in this tenant", 409)
  }
  return null
}

async function insertClient(tenantId: string, data: Record<string, unknown>, qrCode: string) {
  const dni = data.dni as string | undefined
  const birthday = (data.birthday as string) || null
  const customData = (data.customData as Record<string, unknown>) || null

  const [inserted] = await db
    .insert(clients)
    .values({
      tenantId,
      name: data.name as string,
      lastName: (data.lastName as string) || null,
      dni: dni || null,
      phone: (data.phone as string) || null,
      email: (data.email as string) || null,
      qrCode,
      marketingOptIn: (data.marketingOptIn as boolean) ?? false,
      birthday,
      customData,
    })
    .returning()
  return inserted
}

async function handleMarketingBonus(
  client: { id: string; totalVisits: number; pointsBalance: number },
  tenantId: string,
  registrationConfig: RegistrationConfig | null,
  marketingOptIn: boolean,
) {
  if (!marketingOptIn || !registrationConfig?.marketingBonus?.enabled) {
    return null
  }

  await applyMarketingBonus({
    client,
    tenantId,
    config: registrationConfig.marketingBonus,
  }).catch((err) => {
    console.error("[POST /api/[tenant]/register-client] Marketing bonus failed:", err)
  })

  const [updatedClient] = await db.select().from(clients).where(eq(clients.id, client.id)).limit(1)
  return updatedClient ?? null
}

// ── Route Handler ───────────────────────────────────────────────────

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    const body = await request.json()
    const registrationConfig = parseRegistrationConfig(tenant)

    const schema = registrationConfig
      ? buildRegistrationSchema(registrationConfig)
      : registerClientSchema
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const data = parsed.data as Record<string, unknown>
    const dni = data.dni as string | undefined

    const dniError = await checkDniUniqueness(tenant.id, dni)
    if (dniError) return dniError

    const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    const qrCode = `cuik:${slug}:${hex}`

    let client: typeof clients.$inferSelect

    try {
      client = await insertClient(tenant.id, data, qrCode)
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        return errorResponse(
          "Este email ya esta registrado. Ingresa tu email en la pagina de registro para acceder a tu pase.",
          409,
        )
      }
      throw err
    }

    const marketingOptIn = (data.marketingOptIn as boolean) ?? false
    const updatedClient = await handleMarketingBonus(
      client,
      tenant.id,
      registrationConfig,
      marketingOptIn,
    )
    if (updatedClient) client = updatedClient

    const walletUrls = await generateWalletUrls({
      client,
      tenant,
      slug,
      requestUrl: request.url,
    }).catch((err) => {
      console.error("[POST /api/[tenant]/register-client] Wallet generation failed:", err)
      return { apple: null, google: null }
    })

    return successResponse({ ...client, walletUrls }, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/register-client]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * Apply marketing bonus (stamps or points) when client opts in during registration.
 */
async function applyMarketingBonus(ctx: {
  client: { id: string; totalVisits: number; pointsBalance: number }
  tenantId: string
  config: { enabled: boolean; stampsBonus: number; pointsBonus: number }
}) {
  const { client, tenantId, config } = ctx

  // Find active promotion to determine type
  const [promotion] = await db
    .select({ id: promotions.id, type: promotions.type, maxVisits: promotions.maxVisits })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .limit(1)

  if (!promotion) return

  if (promotion.type === "stamps" && config.stampsBonus > 0) {
    // Insert bonus visit records
    const maxVisits = promotion.maxVisits ?? 10
    const currentCycleVisits = client.totalVisits % maxVisits

    for (let i = 0; i < config.stampsBonus; i++) {
      const visitNum = currentCycleVisits + i + 1
      const cycleNumber = Math.floor((client.totalVisits + i) / maxVisits) + 1

      await db.insert(visits).values({
        clientId: client.id,
        tenantId,
        visitNum: visitNum > maxVisits ? visitNum % maxVisits || maxVisits : visitNum,
        cycleNumber,
        source: "bonus",
        amount: null,
        locationId: null,
      })
    }

    // Update client totalVisits
    const newTotalVisits = client.totalVisits + config.stampsBonus
    await db.update(clients).set({ totalVisits: newTotalVisits }).where(eq(clients.id, client.id))
  } else if (promotion.type === "points" && config.pointsBonus > 0) {
    // Insert points transaction
    await db.insert(pointsTransactions).values({
      clientId: client.id,
      tenantId,
      amount: config.pointsBonus,
      type: "earn",
      description: "Marketing opt-in bonus",
    })

    // Update client pointsBalance
    const newBalance = client.pointsBalance + config.pointsBonus
    await db.update(clients).set({ pointsBalance: newBalance }).where(eq(clients.id, client.id))
  }
}

// ── Google Wallet helper ─────────────────────────────────────────────

function resolveAssetUrls(assetRows: Array<{ url: string; type: string }>) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const resolveUrl = (path: string) => (path.startsWith("http") ? path : `${baseUrl}${path}`)

  const logoAsset = assetRows.find((a) => a.type === "logo")
  const iconAsset = assetRows.find((a) => a.type === "icon")
  const stripBgAsset = assetRows.find((a) => a.type === "strip_bg")

  const programLogoUrl = logoAsset?.url
    ? resolveUrl(logoAsset.url)
    : iconAsset?.url
      ? resolveUrl(iconAsset.url)
      : undefined
  const heroImageUrl = stripBgAsset?.url ? resolveUrl(stripBgAsset.url) : undefined

  return { programLogoUrl, wideProgramLogoUrl: programLogoUrl, heroImageUrl }
}

async function generateGoogleWalletUrl(ctx: {
  client: {
    id: string
    name: string
    lastName: string | null
    dni: string | null
    totalVisits: number
    pointsBalance: number
  }
  tenant: { id: string; name: string }
  googleDesign: { id: string; fields: unknown; colors: unknown }
  googleConfig: {
    issuerId: string
    serviceAccountJson: { client_email: string; private_key: string }
  }
  serialNumber: string
  maxVisits: number
  requestUrl: string
}): Promise<string | null> {
  try {
    const { client, tenant, googleDesign, googleConfig, serialNumber, maxVisits, requestUrl } = ctx

    const accessToken = await getGoogleAccessToken(googleConfig)
    const classId = buildGoogleClassId(googleConfig.issuerId, tenant.name)

    const assetRows = await db
      .select({ url: passAssets.url, type: passAssets.type })
      .from(passAssets)
      .where(eq(passAssets.designId, googleDesign.id))

    const { programLogoUrl, wideProgramLogoUrl, heroImageUrl } = resolveAssetUrls(assetRows)

    const designColors = googleDesign.colors as { backgroundColor?: string } | null
    const hexBackgroundColor = designColors?.backgroundColor
      ? cssColorToHex(designColors.backgroundColor)
      : undefined

    await ensureLoyaltyClass({
      accessToken,
      issuerId: googleConfig.issuerId,
      classId,
      programName: tenant.name,
      issuerName: tenant.name,
      programLogoUrl,
      hexBackgroundColor,
      heroImageUrl,
      wideProgramLogoUrl,
    })

    const [activePromotion] = await db
      .select({ type: promotions.type })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .limit(1)

    const stampsInCycle = client.totalVisits % maxVisits
    const resolvedDesignFields = resolveDesignFieldsForClient(
      googleDesign.fields,
      client,
      { current: stampsInCycle, max: maxVisits, total: client.totalVisits },
      0,
      tenant.name,
    )

    const upsertResult = await upsertLoyaltyObject({
      issuerId: googleConfig.issuerId,
      classId,
      serialNumber,
      clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
      clientDni: client.dni ?? undefined,
      stampsInCycle,
      maxVisits,
      totalVisits: client.totalVisits,
      hasReward: false,
      rewardRedeemed: false,
      qrValue: serialNumber,
      accessToken,
      designFields: resolvedDesignFields,
      imageUrl: heroImageUrl,
      promotionType: activePromotion?.type,
    })

    if (!upsertResult.ok) return null

    const url = new URL(requestUrl)
    const saveUrl = await buildSaveToWalletUrl({
      objectId: upsertResult.objectId,
      serviceAccountEmail: googleConfig.serviceAccountJson.client_email,
      privateKey: googleConfig.serviceAccountJson.private_key,
      origins: [url.origin],
    })

    await db
      .update(passInstances)
      .set({ googleSaveUrl: saveUrl, googleObjectId: upsertResult.objectId })
      .where(eq(passInstances.serialNumber, serialNumber))

    return saveUrl
  } catch (err) {
    console.error("[Wallet:Google] Save link generation failed during registration:", err)
    return null
  }
}

function resolveDesignFieldsForClient(
  fieldsRaw: unknown,
  client: { name: string; lastName: string | null; totalVisits: number; pointsBalance: number },
  stamps: { current: number; max: number; total: number },
  pendingRewards: number,
  tenantName: string,
): ReturnType<typeof resolvePassFields> | undefined {
  const fields = fieldsRaw as {
    headerFields?: Array<{ key: string; label: string; value: string }>
    secondaryFields?: Array<{ key: string; label: string; value: string }>
    backFields?: Array<{ key: string; label: string; value: string }>
  } | null

  if (
    !fields ||
    (!fields.headerFields?.length && !fields.secondaryFields?.length && !fields.backFields?.length)
  ) {
    return undefined
  }

  const templateContext: TemplateContext = {
    client: {
      name: client.name,
      lastName: client.lastName,
      totalVisits: client.totalVisits,
      pointsBalance: client.pointsBalance,
    },
    stamps: {
      current: stamps.current,
      max: stamps.max,
      remaining: stamps.max - stamps.current,
      total: stamps.total,
    },
    points: { balance: client.pointsBalance },
    rewards: { pending: pendingRewards },
    tenant: { name: tenantName },
  }
  return resolvePassFields(fields, templateContext)
}

/**
 * Generate wallet pass URLs for a newly registered client.
 * Returns null URLs if wallet is not configured or no pass design exists.
 * Never throws — wraps all errors.
 */
async function generateWalletUrls(ctx: {
  client: {
    id: string
    name: string
    lastName: string | null
    qrCode: string | null
    dni: string | null
    totalVisits: number
    pointsBalance: number
  }
  tenant: { id: string; name: string }
  slug: string
  requestUrl: string
}): Promise<{ apple: string | null; google: string | null }> {
  const { client, tenant, slug, requestUrl } = ctx

  if (!client.qrCode) return { apple: null, google: null }

  // Find ALL active pass designs for tenant (there may be one for Apple and one for Google)
  const designRows = await db
    .select({
      id: passDesigns.id,
      type: passDesigns.type,
      stampsConfig: passDesigns.stampsConfig,
      fields: passDesigns.fields,
      colors: passDesigns.colors,
    })
    .from(passDesigns)
    .where(and(eq(passDesigns.tenantId, tenant.id), eq(passDesigns.isActive, true)))

  if (designRows.length === 0) {
    console.warn(
      `[Wallet] No active pass design found for tenant "${tenant.name}" (id: ${tenant.id}). ` +
        "The SA must publish a pass design before wallet passes can be generated.",
    )
    return { apple: null, google: null }
  }

  // Separate designs by type — use type-specific design when available, fall back to any
  const appleDesign = designRows.find((d) => d.type === "apple_store") ?? designRows[0]
  const googleDesign = designRows.find((d) => d.type === "google_loyalty") ?? designRows[0]
  // Primary design for pass_instance (prefer Apple since regeneratePass uses designId)
  const design = appleDesign

  const stampsConfig = design.stampsConfig as { maxVisits?: number } | null
  const maxVisits = stampsConfig?.maxVisits ?? 10

  const serialNumber = client.qrCode
  let appleUrl: string | null = null
  let googleUrl: string | null = null

  // Create pass_instances row — use tenant-specific Apple config
  const appleConfig = await getTenantAppleConfig(tenant.id)
  const authToken = appleConfig ? generateAuthToken(appleConfig.authSecret, serialNumber) : null

  await db.insert(passInstances).values({
    clientId: client.id,
    designId: design.id,
    serialNumber,
    authToken,
    lastUpdatedAt: new Date(),
  })

  // Apple: construct the download URL with auth token (public, no session required)
  if (appleConfig && authToken) {
    appleUrl = `/api/${slug}/wallet/apple/${client.id}/${authToken}`
  }

  // Google: upsert loyalty object + generate save link
  const googleConfig = validateGoogleEnv()
  if (googleConfig) {
    googleUrl = await generateGoogleWalletUrl({
      client,
      tenant,
      googleDesign,
      googleConfig,
      serialNumber,
      maxVisits,
      requestUrl,
    })
  }

  // Update pass_instances with Apple URL if available
  if (appleUrl) {
    await db
      .update(passInstances)
      .set({ applePassUrl: appleUrl })
      .where(eq(passInstances.serialNumber, serialNumber))
  }

  return { apple: appleUrl, google: googleUrl }
}

/**
 * Convert a CSS color string to hex format (#rrggbb).
 * Supports "#rrggbb", "#rgb", and "rgb(r, g, b)" formats.
 * Returns undefined if the format is unrecognized.
 */
function cssColorToHex(color: string): string | undefined {
  const trimmed = color.trim()

  // Already hex
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 7) return trimmed
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed
      return `#${r}${r}${g}${g}${b}${b}`
    }
    return trimmed
  }

  // rgb(r, g, b)
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, "0")
    const g = Number(rgbMatch[2]).toString(16).padStart(2, "0")
    const b = Number(rgbMatch[3]).toString(16).padStart(2, "0")
    return `#${r}${g}${b}`
  }

  return undefined
}
