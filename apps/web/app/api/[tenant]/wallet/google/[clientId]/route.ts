import {
  and,
  clients,
  count,
  db,
  eq,
  passAssets,
  passDesigns,
  passInstances,
  promotions,
  rewards,
} from "@cuik/db"
import {
  buildGoogleClassId,
  buildSaveToWalletUrl,
  ensureLoyaltyClass,
  getGoogleAccessToken,
  upsertLoyaltyObject,
} from "@cuik/wallet/google"
import { resolvePassFields, type TemplateContext, validateGoogleEnv } from "@cuik/wallet/shared"
import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential Google Wallet object creation with class setup, field resolution, and save URL generation
export async function POST(
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

    // 2. Validate Google env
    const googleConfig = validateGoogleEnv()
    if (!googleConfig) {
      return errorResponse("Google Wallet not configured", 503)
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

    // 4. Find active pass design (include colors for Google styling)
    const designRows = await db
      .select({
        id: passDesigns.id,
        stampsConfig: passDesigns.stampsConfig,
        fields: passDesigns.fields,
        colors: passDesigns.colors,
      })
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, tenant.id), eq(passDesigns.isActive, true)))
      .limit(1)

    const design = designRows[0]
    if (!design) return errorResponse("No active pass design found", 404)

    // 5. Get active promotion type for loyalty label
    const [activePromotion] = await db
      .select({ type: promotions.type })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .limit(1)

    // 6. Calculate stamp state
    const stampsConfig = design.stampsConfig as { maxVisits: number } | null
    const maxVisits = stampsConfig?.maxVisits ?? 8
    const stampsInCycle = client.totalVisits % maxVisits

    // Check pending rewards
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
    const pendingRewards = Number(pendingRewardRows[0]?.cnt ?? 0)
    const hasReward = pendingRewards > 0

    // 6. Resolve dynamic design fields (mirror Apple route pattern)
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

    // 7. Get Google access token
    const accessToken = await getGoogleAccessToken(googleConfig)

    // 8. Build classId and ensure loyalty class exists
    const serialNumber = client.qrCode
    const classId = buildGoogleClassId(googleConfig.issuerId, tenant.name)

    // Get logo + strip_bg asset URLs for loyalty class styling
    const assetRows = await db
      .select({ url: passAssets.url, type: passAssets.type })
      .from(passAssets)
      .where(and(eq(passAssets.designId, design.id)))

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
    const wideProgramLogoUrl = programLogoUrl
    const heroImageUrl = stripBgAsset?.url ? resolveUrl(stripBgAsset.url) : undefined

    // Extract hex background color from design colors
    const designColors = design.colors as { backgroundColor?: string } | null
    let hexBackgroundColor: string | undefined
    if (designColors?.backgroundColor) {
      hexBackgroundColor = cssColorToHex(designColors.backgroundColor)
    }

    // Ensure loyalty class exists (non-blocking — upsert will still work if class exists)
    const classResult = await ensureLoyaltyClass({
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
    if (!classResult.ok) {
      console.warn(
        "[POST /api/[tenant]/wallet/google/[clientId]] ensureLoyaltyClass failed:",
        classResult.error,
      )
    }

    // 9. Upsert loyalty object
    const upsertResult = await upsertLoyaltyObject({
      issuerId: googleConfig.issuerId,
      classId,
      serialNumber,
      clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
      clientDni: client.dni ?? undefined,
      stampsInCycle,
      maxVisits,
      totalVisits: client.totalVisits,
      hasReward,
      rewardRedeemed: false,
      qrValue: serialNumber,
      accessToken,
      designFields: resolvedDesignFields,
      imageUrl: heroImageUrl,
      promotionType: activePromotion?.type,
    })

    if (!upsertResult.ok) {
      console.error("[POST /api/[tenant]/wallet/google/[clientId]]", upsertResult.error)
      return errorResponse("Failed to create Google Wallet object", 500)
    }

    // 10. Generate save-to-wallet URL
    const url = new URL(request.url)
    const saveUrl = await buildSaveToWalletUrl({
      objectId: upsertResult.objectId,
      serviceAccountEmail: googleConfig.serviceAccountJson.client_email,
      privateKey: googleConfig.serviceAccountJson.private_key,
      origins: [url.origin],
    })

    // 11. Save/update pass_instances
    const now = new Date()

    const existingInstance = await db
      .select({ id: passInstances.id })
      .from(passInstances)
      .where(eq(passInstances.serialNumber, serialNumber))
      .limit(1)

    if (existingInstance.length > 0) {
      await db
        .update(passInstances)
        .set({
          googleSaveUrl: saveUrl,
          googleObjectId: upsertResult.objectId,
          lastUpdatedAt: now,
        })
        .where(eq(passInstances.serialNumber, serialNumber))
    } else {
      await db.insert(passInstances).values({
        clientId: client.id,
        designId: design.id,
        serialNumber,
        googleSaveUrl: saveUrl,
        googleObjectId: upsertResult.objectId,
        lastUpdatedAt: now,
      })
    }

    return successResponse({ saveUrl })
  } catch (error) {
    console.error("[POST /api/[tenant]/wallet/google/[clientId]]", error)
    return errorResponse("Internal server error", 500)
  }
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
      // Expand #rgb to #rrggbb
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
