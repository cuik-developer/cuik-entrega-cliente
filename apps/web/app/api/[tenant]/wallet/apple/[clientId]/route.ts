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
import { createApplePass, generateAuthToken, generateStripImage } from "@cuik/wallet/apple"
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
import { errorResponse, requireAuth, requireTenantMembership, resolveTenant } from "@/lib/api-utils"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential Apple Wallet pass generation with asset loading, strip image composition, field resolution, and pass signing — splitting would scatter the tightly-coupled flow
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; clientId: string }> },
) {
  try {
    // 1. Auth + tenant resolution
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, clientId } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // 2. Resolve tenant-specific Apple config (falls back to global env)
    const appleConfig = await getTenantAppleConfig(tenant.id)
    if (!appleConfig) {
      return errorResponse("Apple Wallet not configured", 503)
    }

    // 3. Find client (verify tenant ownership)
    const clientRows = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)

    const client = clientRows[0]
    if (!client) return errorResponse("Client not found", 404)
    if (!client.qrCode) return errorResponse("Client has no QR code", 400)

    // 4. Find pass design: prioritize active promotion's linked design, fallback to any published
    let design: typeof passDesigns.$inferSelect | null = null

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

    // 5. Calculate stamp count
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

    // 6. Generate auth token and serial
    const serialNumber = client.qrCode
    const authToken = generateAuthToken(appleConfig.authSecret, serialNumber)

    // 7. Load assets and generate strip image
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
      // Convert buffers to data URIs for strip image generation
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
      // Fallback: create minimal 1px transparent PNG for strip
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

    // Load optional logo
    const logoAsset = assetMap.get("logo")
    const logoBuffer = logoAsset ? await loadAssetBuffer(logoAsset.url) : undefined

    // 8. Parse colors from design
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

    // 10. Create the .pkpass
    const signerCert = decodePemOrDer(appleConfig.signerCertBase64, "CERTIFICATE")
    const signerKey = decodePemOrDer(appleConfig.signerKeyBase64, "RSA PRIVATE KEY")
    const wwdr = decodePemOrDer(appleConfig.wwdrBase64, "CERTIFICATE")
    console.log("[Apple Wallet] signerKey format:", signerKey.split("\n")[0])
    console.log("[Apple Wallet] signerKey length:", signerKey.length, "chars")
    console.log("[Apple Wallet] signerCert format:", signerCert.split("\n")[0])
    console.log("[Apple Wallet] wwdr format:", wwdr.split("\n")[0])
    try {
      const crypto = await import("node:crypto")
      const keyObj = crypto.createPrivateKey(signerKey)
      const certObj = crypto.createPublicKey(signerCert)
      const keyJwk = keyObj.export({ format: "jwk" })
      const certJwk = certObj.export({ format: "jwk" })
      console.log("[Apple Wallet] KEY-CERT MODULUS MATCH:", keyJwk.n === certJwk.n)
      if (keyJwk.n !== certJwk.n) {
        console.error("[Apple Wallet] *** KEY DOES NOT MATCH CERTIFICATE! ***")
      }
    } catch (diagErr) {
      console.error("[Apple Wallet] Diagnostic error:", diagErr)
    }

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
      console.error("[POST /api/[tenant]/wallet/apple/[clientId]]", passResult.error)
      return errorResponse("Failed to generate Apple pass", 500)
    }

    // 11. Save/update pass_instances
    const now = new Date()
    const etag = generateETag(serialNumber, client.totalVisits, now)
    const applePassUrl = `/api/${slug}/wallet/apple/${clientId}`

    const existingInstance = await db
      .select({ id: passInstances.id })
      .from(passInstances)
      .where(eq(passInstances.serialNumber, serialNumber))
      .limit(1)

    if (existingInstance.length > 0) {
      await db
        .update(passInstances)
        .set({
          authToken,
          etag,
          applePassUrl,
          lastUpdatedAt: now,
        })
        .where(eq(passInstances.serialNumber, serialNumber))
    } else {
      await db.insert(passInstances).values({
        clientId: client.id,
        designId: design.id,
        serialNumber,
        authToken,
        etag,
        applePassUrl,
        lastUpdatedAt: now,
      })
    }

    // 12. Return .pkpass binary
    // Convert Node.js Buffer to Uint8Array so the Web Response API
    // transmits raw bytes instead of a UTF-8-mangled string.
    const body = new Uint8Array(passResult.buffer)

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": APPLE_PASS_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${serialNumber}.pkpass"`,
        "Content-Encoding": "identity",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store, no-transform",
        "Last-Modified": now.toUTCString(),
        ETag: etag,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/wallet/apple/[clientId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
