import {
  and,
  clients,
  count,
  db,
  desc,
  eq,
  passAssets,
  passDesigns,
  passInstances,
  promotions,
  rewards,
  tenants,
} from "@cuik/db"
import { createApplePass, verifyAuthToken } from "@cuik/wallet/apple"
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
import { errorResponse, resolveTenant } from "@/lib/api-utils"
import { pointsExpiryTemplateVars } from "@/lib/loyalty/points-lots"
import { buildStripImages } from "@/lib/wallet/points-strip"
import { passRelevantDate } from "@/lib/wallet/relevant-date"
import {
  type StampsConfigLike,
  safeAssetUrl,
  stripCompleted,
  stripLayoutFrom,
  stripMaxVisits,
} from "@/lib/wallet/strip-layout"
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

    // 5. Find pass design: published first (see below)
    let design: typeof passDesigns.$inferSelect | null = null

    // Try: find active promotion → its linked pass design
    const [activePromo] = await db
      .select({ id: promotions.id, type: promotions.type, maxVisits: promotions.maxVisits })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .limit(1)

    // What the client sees is the PUBLISHED design, as in registration, Google
    // and pass updates. Among published designs the one linked to the active
    // promotion wins; a linked draft is used only when the tenant has not
    // published any Apple design yet.
    const candidates = await db
      .select()
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, tenant.id), eq(passDesigns.type, "apple_store")))
      .orderBy(desc(passDesigns.updatedAt))
    const linkedToPromo = (d: (typeof candidates)[number]) =>
      activePromo != null && d.promotionId === activePromo.id
    design =
      candidates.find((d) => d.isActive && linkedToPromo(d)) ??
      candidates.find((d) => d.isActive) ??
      candidates.find(linkedToPromo) ??
      null

    if (!design) return errorResponse("No active pass design found", 404)

    const assets = await db.select().from(passAssets).where(eq(passAssets.designId, design.id))

    const assetMap = new Map<string, PassAssetData>()
    for (const asset of assets) {
      assetMap.set(asset.type, asset as unknown as PassAssetData)
    }

    const iconAsset = assetMap.get("icon")
    if (!iconAsset) return errorResponse("Pass design missing icon asset", 400)

    // 6. Calculate stamp count
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
          eq(rewards.tenantId, tenant.id),
          eq(rewards.status, "pending"),
        ),
      )
    const completed = stripCompleted(
      stampsInCycle,
      Number(pendingRewardRows[0]?.cnt ?? 0),
      client.totalVisits,
    )

    // 7. Load assets and generate strip image
    console.log("[Apple Wallet] Loading assets...")
    const authToken = token // Already verified — reuse for pass
    const stripBgUrl = assetMap.get("strip_bg")?.url
    const stampUrl = assetMap.get("stamp")?.url
    const specialStampUrl = safeAssetUrl(stampsConfig?.specialStampUrl)
    const [iconBuffer, stripBgAsset, stampAsset, specialStampBuffer] = await Promise.all([
      loadAssetBuffer(iconAsset.url),
      stripBgUrl ? loadAssetBuffer(stripBgUrl) : null,
      stampUrl ? loadAssetBuffer(stampUrl) : null,
      specialStampUrl ? loadAssetBuffer(specialStampUrl).catch(() => null) : null,
    ])

    // Points passes: background only (no stamp grid). Stamps: grid as before.
    // Real MIME sniffed from the bytes (a JPG used to be labelled PNG). See lib/wallet/points-strip.ts.
    const { strip2x: stripImage2x, strip1x: stripImage1x } = await buildStripImages({
      programType: activePromo?.type === "points" ? "points" : "stamps",
      background: stripBgAsset,
      stamp: stampAsset,
      stampsInCycle,
      maxVisits,
      gridLayout: stripLayoutFrom(stampsConfig),
      specialStamp: specialStampBuffer,
      completed,
    })

    const logoAsset = assetMap.get("logo")
    const logoBuffer = logoAsset ? await loadAssetBuffer(logoAsset.url) : undefined

    // 8. Parse colors
    const colors = design.colors as {
      backgroundColor?: string
      foregroundColor?: string
      labelColor?: string
    } | null

    // Pending rewards (counted above, before the strip)
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
    const relevantDate = await passRelevantDate({
      enabled: walletConfig?.relevantDateEnabled,
      clientId: client.id,
      tenantId: tenant.id,
      promotionType: activePromo?.type,
      pendingRewards: Number(pendingRewards),
    })

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
          // A completed card with its reward pending is drawn full: say so in the text too.
          current: completed ? maxVisits : stampsInCycle,
          max: maxVisits,
          remaining: completed ? 0 : maxVisits - stampsInCycle,
          total: client.totalVisits,
        },
        points: {
          balance: client.pointsBalance,
          ...(await pointsExpiryTemplateVars(db, client.id, tenant.timezone ?? "America/Lima")),
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

    // Diagnostic: the signer cert must belong to this pass type, be unexpired
    // and be issued by the WWDR cert we bundle.
    try {
      const { X509Certificate } = await import("node:crypto")
      const wwdrX509 = new X509Certificate(wwdr)
      const signerX509 = new X509Certificate(signerCert)
      const daysLeft = (cert: InstanceType<typeof X509Certificate>) =>
        Math.floor((Date.parse(cert.validTo) - Date.now()) / 86_400_000)
      const signerDays = daysLeft(signerX509)
      const uid = signerX509.subject
        .split("\n")
        .find((l) => l.startsWith("UID="))
        ?.slice(4)
      console.log(
        "[Apple Wallet] Signer cert:",
        uid,
        "expires",
        signerX509.validTo,
        `(${signerDays} days)`,
      )
      console.log("[Apple Wallet] WWDR expires", wwdrX509.validTo, `(${daysLeft(wwdrX509)} days)`)
      console.log(
        "[Apple Wallet] SIGNER CERT VALID:",
        signerDays > 0 && uid === appleConfig.passTypeId,
      )
      console.log("[Apple Wallet] WWDR verifies signer:", signerX509.verify(wwdrX509.publicKey))
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
      console.error("[Apple Wallet] Pass generation failed:", passResult.error)
      return errorResponse("Failed to generate Apple pass", 500)
    }
    console.log(
      "[Apple Wallet] Pass generated successfully, size:",
      passResult.buffer.length,
      "bytes",
    )

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
    // Convert Node.js Buffer to Uint8Array so the Web Response API
    // transmits raw bytes instead of a UTF-8-mangled string.
    // Node Buffer is a Uint8Array subclass, but some Next.js versions
    // serialise it incorrectly; an explicit Uint8Array avoids that.
    const body = new Uint8Array(passResult.buffer)

    // Log hash for transit integrity verification
    const crypto2 = await import("node:crypto")
    const bodyHash = crypto2.createHash("sha256").update(body).digest("hex").substring(0, 16)
    console.log("[Apple Wallet] Response body SHA256 prefix:", bodyHash, "bytes:", body.byteLength)

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
    console.error("[GET /api/[tenant]/wallet/apple/[clientId]/[token]]", error)
    return errorResponse("Internal server error", 500)
  }
}
