import {
  and,
  asc,
  clients,
  count,
  db,
  eq,
  passAssets,
  passDesigns,
  passInstances,
  promotions,
  rewards,
  tenants,
} from "@cuik/db"
import { createApplePass, generateStripImage, verifyAuthToken } from "@cuik/wallet/apple"
import {
  APPLE_PASS_CONTENT_TYPE,
  APPLE_PASS_DEFAULT_DESCRIPTION,
  APPLE_PASS_LOGO_TEXT,
  generateETag,
  loadAssetBuffer,
  type PassAssetData,
  resolvePassFields,
  type TemplateContext,
} from "@cuik/wallet/shared"
import sharp from "sharp"
import { errorResponse, resolveTenant } from "@/lib/api-utils"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"

/**
 * Decode a credential that may be:
 * 1. Raw PEM text (starts with -----BEGIN)
 * 2. Base64-encoded PEM (decodes to -----BEGIN)
 * 3. Base64-encoded DER binary (wrap in PEM)
 */
function decodePemOrDer(input: string, type: string): string {
  // Case 1: raw PEM text passed directly
  if (input.startsWith("-----BEGIN")) {
    return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  }
  // Case 2 & 3: base64-encoded
  const raw = Buffer.from(input, "base64")
  const str = raw.toString("utf-8")
  if (str.startsWith("-----BEGIN")) {
    return str.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  }
  // DER binary — wrap in PEM
  const b64Lines =
    raw
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n") ?? raw.toString("base64")
  return `-----BEGIN ${type}-----\n${b64Lines}\n-----END ${type}-----\n`
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Public Apple Wallet pass download — authenticated via URL token (HMAC-SHA256).
 * Used by clients clicking "Agregar a Apple Wallet" from the bienvenido page.
 * No session required — token proves knowledge of the pass serial.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential Apple Wallet pass generation with asset loading, strip image composition, field resolution, and pass signing — splitting would scatter the tightly-coupled flow
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; clientId: string; token: string }> },
) {
  console.log("[Apple Wallet] Route handler invoked")
  try {
    const { tenant: slug, clientId, token } = await params
    console.log(`[Apple Wallet] Generating pass for tenant=${slug} client=${clientId}`)

    // 1. Resolve tenant (public — no auth required)
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      console.error("[Apple Wallet] Tenant not found:", slug)
      return errorResponse("Tenant not found", 404)
    }

    // 2. Resolve tenant-specific Apple config (falls back to global env)
    const appleConfig = await getTenantAppleConfig(tenant.id)
    if (!appleConfig) {
      console.error("[Apple Wallet] Apple config is null for tenant:", tenant.id)
      return errorResponse("Apple Wallet not configured", 503)
    }
    console.log("[Apple Wallet] Config loaded, passTypeId:", appleConfig.passTypeId)

    // 3. Find client (verify tenant ownership)
    const clientRows = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)

    const client = clientRows[0]
    if (!client) return errorResponse("Client not found", 404)
    if (!client.qrCode) return errorResponse("Client has no QR code", 400)

    // 4. Verify auth token (timing-safe HMAC comparison)
    const serialNumber = client.qrCode
    if (!verifyAuthToken(appleConfig.authSecret, serialNumber, token)) {
      return errorResponse("Invalid token", 401)
    }

    // 5. Find pass design: prioritize active promotion's linked design, fallback to any published
    let design: typeof passDesigns.$inferSelect | null = null

    // Try: find active promotion → its linked pass design
    const [activePromo] = await db
      .select({ id: promotions.id })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .limit(1)

    if (activePromo) {
      const [linked] = await db
        .select()
        .from(passDesigns)
        .where(
          and(
            eq(passDesigns.tenantId, tenant.id),
            eq(passDesigns.promotionId, activePromo.id),
            eq(passDesigns.type, "apple_store"),
          ),
        )
        .limit(1)
      design = linked ?? null
    }

    // Fallback: any published apple_store design
    if (!design) {
      const [published] = await db
        .select()
        .from(passDesigns)
        .where(
          and(
            eq(passDesigns.tenantId, tenant.id),
            eq(passDesigns.isActive, true),
            eq(passDesigns.type, "apple_store"),
          ),
        )
        .limit(1)
      design = published ?? null
    }

    if (!design) return errorResponse("No active pass design found", 404)

    const assets = await db.select().from(passAssets).where(eq(passAssets.designId, design.id))

    const assetMap = new Map<string, PassAssetData>()
    for (const asset of assets) {
      assetMap.set(asset.type, asset as unknown as PassAssetData)
    }

    const iconAsset = assetMap.get("icon")
    if (!iconAsset) return errorResponse("Pass design missing icon asset", 400)

    // 6. Calculate stamp count
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

    // 7. Load assets and generate strip image
    console.log("[Apple Wallet] Loading assets...")
    const authToken = token // Already verified — reuse for pass
    const stripBgUrl = assetMap.get("strip_bg")?.url
    const stampUrl = assetMap.get("stamp")?.url
    const [iconBuffer, stripBgAsset, stampAsset] = await Promise.all([
      loadAssetBuffer(iconAsset.url),
      stripBgUrl ? loadAssetBuffer(stripBgUrl) : null,
      stampUrl ? loadAssetBuffer(stampUrl) : null,
    ])

    let stripImage2x: Buffer
    let stripImage1x: Buffer

    if (stripBgAsset && stampAsset) {
      const bgDataUri = `data:image/png;base64,${stripBgAsset.toString("base64")}`
      const stampDataUri = `data:image/png;base64,${stampAsset.toString("base64")}`

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

    // 8. Parse colors
    const colors = design.colors as {
      backgroundColor?: string
      foregroundColor?: string
      labelColor?: string
    } | null

    // Count pending rewards
    const pendingRewardRows = await db
      .select({ cnt: count() })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenant.id),
          eq(rewards.status, "pending"),
        ),
      )
    const pendingRewards = pendingRewardRows[0]?.cnt ?? 0

    // Parse wallet config for locations and relevantDate
    const [tenantWithConfig] = await db
      .select({ walletConfig: tenants.walletConfig })
      .from(tenants)
      .where(eq(tenants.id, tenant.id))
      .limit(1)

    const walletConfig = tenantWithConfig?.walletConfig as {
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
    if (walletConfig?.relevantDateEnabled && Number(pendingRewards) > 0) {
      const [nearestReward] = await db
        .select({ expiresAt: rewards.expiresAt })
        .from(rewards)
        .where(
          and(
            eq(rewards.clientId, client.id),
            eq(rewards.tenantId, tenant.id),
            eq(rewards.status, "pending"),
          ),
        )
        .orderBy(asc(rewards.expiresAt))
        .limit(1)
      if (nearestReward?.expiresAt) {
        relevantDate = nearestReward.expiresAt
      }
    }

    // 9. Resolve dynamic design fields (if configured)
    const designFields = design.fields as {
      headerFields?: Array<{ key: string; label: string; value: string }>
      secondaryFields?: Array<{ key: string; label: string; value: string }>
      backFields?: Array<{ key: string; label: string; value: string }>
    } | null

    let resolvedDesignFields: ReturnType<typeof resolvePassFields> | undefined
    if (
      designFields &&
      (designFields.headerFields?.length ||
        designFields.secondaryFields?.length ||
        designFields.backFields?.length)
    ) {
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
          pending: Number(pendingRewards),
        },
        tenant: {
          name: tenant.name,
        },
      }
      resolvedDesignFields = resolvePassFields(designFields, templateContext)
    }

    // 10. Create .pkpass
    console.log("[Apple Wallet] Assets loaded, creating .pkpass...")
    const signerCert = decodePemOrDer(appleConfig.signerCertBase64, "CERTIFICATE")
    const signerKey = decodePemOrDer(appleConfig.signerKeyBase64, "RSA PRIVATE KEY")
    const wwdr = decodePemOrDer(appleConfig.wwdrBase64, "CERTIFICATE")
    const passResult = await createApplePass({
      teamId: appleConfig.teamId,
      passTypeId: appleConfig.passTypeId,
      serialNumber,
      authToken,
      webServiceUrl: appleConfig.webServiceUrl,
      signerCert,
      signerKey,
      signerKeyPassphrase: appleConfig.signerKeyPassphrase,
      wwdr,
      organizationName: tenant.name,
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
      pendingRewards: Number(pendingRewards),
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
      console.error("[Apple Wallet] Pass generation failed:", passResult.error)
      return errorResponse("Failed to generate Apple pass", 500)
    }
    console.log("[Apple Wallet] Pass generated successfully, size:", passResult.buffer.length, "bytes")

    // 11. Update pass_instances
    const now = new Date()
    const etag = generateETag(serialNumber, client.totalVisits, now)

    await db
      .update(passInstances)
      .set({
        authToken,
        etag,
        applePassUrl: `/api/${slug}/wallet/apple/${clientId}/${token}`,
        lastUpdatedAt: now,
      })
      .where(eq(passInstances.serialNumber, serialNumber))

    // 12. Return .pkpass binary
    return new Response(passResult.buffer, {
      status: 200,
      headers: {
        "Content-Type": APPLE_PASS_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${serialNumber}.pkpass"`,
        "Cache-Control": "no-store",
        "Last-Modified": now.toUTCString(),
        ETag: etag,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/wallet/apple/[clientId]/[token]]", error)
    return errorResponse("Internal server error", 500)
  }
}
