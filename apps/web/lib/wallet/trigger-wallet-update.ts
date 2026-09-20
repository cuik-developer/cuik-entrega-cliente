import {
  and,
  appleDevices,
  clients,
  db,
  eq,
  passDesigns,
  passInstances,
  promotions,
} from "@cuik/db"
import { buildGoogleClassId, getGoogleAccessToken } from "@cuik/wallet/google"
import {
  generateETag,
  resolvePassFields,
  type TemplateContext,
  updateWalletAfterVisit,
  validateAppleApnsEnv,
  validateGoogleEnv,
} from "@cuik/wallet/shared"

import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"

/**
 * Non-blocking wallet update after a balance change (visit, redemption, bonus).
 * Bumps the pass ETag, pushes Apple (APNs) and upserts the Google loyalty object.
 * Extracted from the visits route so other routes (redeem) can reuse it.
 * Never throws to the caller when awaited with .catch().
 */
export async function triggerWalletUpdate(ctx: {
  qrCode: string
  clientId: string
  clientName: string
  tenantId: string
  tenantName: string
  stampsInCycle: number
  maxVisits: number
  totalVisits: number
  pendingRewards: number
  pointsBalance: number
}): Promise<void> {
  const serialNumber = ctx.qrCode

  // Find pass_instances for this client
  const instanceRows = await db
    .select({
      id: passInstances.id,
      serialNumber: passInstances.serialNumber,
    })
    .from(passInstances)
    .where(eq(passInstances.serialNumber, serialNumber))
    .limit(1)

  if (instanceRows.length === 0) return // No pass instance — nothing to update

  // Update ETag and lastUpdatedAt
  const now = new Date()
  const etag = generateETag(serialNumber, ctx.totalVisits, now)
  await db
    .update(passInstances)
    .set({ etag, lastUpdatedAt: now })
    .where(eq(passInstances.serialNumber, serialNumber))

  // Get active promotion type for loyalty label
  const [activePromotion] = await db
    .select({ type: promotions.type })
    .from(promotions)
    .where(and(eq(promotions.tenantId, ctx.tenantId), eq(promotions.active, true)))
    .limit(1)

  // Load active design + resolve fields for wallet update
  let resolvedDesignFields: ReturnType<typeof resolvePassFields> | undefined
  try {
    const [activeDesign] = await db
      .select({ fields: passDesigns.fields })
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, ctx.tenantId), eq(passDesigns.isActive, true)))
      .limit(1)

    const designFieldsRaw = activeDesign?.fields as {
      headerFields?: Array<{ key: string; label: string; value: string }>
      secondaryFields?: Array<{ key: string; label: string; value: string }>
      backFields?: Array<{ key: string; label: string; value: string }>
    } | null

    if (
      designFieldsRaw &&
      (designFieldsRaw.headerFields?.length ||
        designFieldsRaw.secondaryFields?.length ||
        designFieldsRaw.backFields?.length)
    ) {
      // Strategic fields ({{client.customData.x}}), phone, birthday, tier live on the
      // client row; without them the Google upsert blanked those variables.
      const [clientRow] = await db
        .select({
          lastName: clients.lastName,
          phone: clients.phone,
          email: clients.email,
          birthday: clients.birthday,
          tier: clients.tier,
          customData: clients.customData,
        })
        .from(clients)
        .where(eq(clients.id, ctx.clientId))
        .limit(1)
      const templateContext: TemplateContext = {
        client: {
          name: ctx.clientName,
          lastName: clientRow?.lastName ?? null,
          phone: clientRow?.phone ?? null,
          email: clientRow?.email ?? null,
          birthday: clientRow?.birthday ?? null,
          tier: clientRow?.tier ?? null,
          totalVisits: ctx.totalVisits,
          pointsBalance: ctx.pointsBalance,
          customData: (clientRow?.customData as Record<string, unknown> | null) ?? null,
        },
        stamps: {
          current: ctx.stampsInCycle,
          max: ctx.maxVisits,
          remaining: ctx.maxVisits - ctx.stampsInCycle,
          total: ctx.totalVisits,
        },
        points: {
          balance: ctx.pointsBalance,
        },
        rewards: {
          pending: ctx.pendingRewards,
        },
        tenant: {
          name: ctx.tenantName,
        },
      }
      resolvedDesignFields = resolvePassFields(designFieldsRaw, templateContext)
    }
  } catch (err) {
    console.warn("[Wallet:Update] Failed to resolve design fields, using fallback:", err)
  }

  // Build Apple config
  let appleParams: {
    deviceTokens: string[]
    passTypeId: string
    p8KeyPem: string
    teamId: string
    keyId: string
  } | null = null

  const apnsConfig = validateAppleApnsEnv()
  const tenantAppleConfig = await getTenantAppleConfig(ctx.tenantId)
  if (apnsConfig) {
    // Query registered Apple devices for this serial
    const deviceRows = await db
      .select({ pushToken: appleDevices.pushToken })
      .from(appleDevices)
      .where(eq(appleDevices.serialNumber, serialNumber))

    const tokens = deviceRows.map((r) => r.pushToken).filter((t): t is string => !!t)

    if (tokens.length > 0) {
      // Tolerate either base64 (preferred) or raw PEM in APPLE_APNS_P8_BASE64.
      const rawP8 = apnsConfig.p8Base64
      const candidate = rawP8.includes("-----BEGIN")
        ? rawP8
        : Buffer.from(rawP8, "base64").toString("utf-8")
      const p8KeyPem = candidate.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      appleParams = {
        deviceTokens: tokens,
        passTypeId: tenantAppleConfig?.passTypeId ?? apnsConfig.topic,
        p8KeyPem,
        teamId: apnsConfig.teamId,
        keyId: apnsConfig.keyId,
      }
    }
  }

  // Build Google config
  let googleParams: {
    issuerId: string
    classId: string
    accessToken: string
    qrValue: string
  } | null = null

  const googleConfig = validateGoogleEnv()
  if (googleConfig) {
    try {
      const accessToken = await getGoogleAccessToken(googleConfig)
      const classId = buildGoogleClassId(googleConfig.issuerId, ctx.tenantName)

      googleParams = {
        issuerId: googleConfig.issuerId,
        classId,
        accessToken,
        qrValue: serialNumber,
      }
    } catch (err) {
      console.error("[Wallet:Google] Failed to get access token for visit update:", err)
    }
  }

  // Fire the update
  const walletResult = await updateWalletAfterVisit({
    clientId: ctx.clientId,
    tenantId: ctx.tenantId,
    serialNumber,
    stampsInCycle: ctx.stampsInCycle,
    maxVisits: ctx.maxVisits,
    totalVisits: ctx.totalVisits,
    hasReward: ctx.pendingRewards > 0,
    rewardRedeemed: false,
    clientName: ctx.clientName,
    apple: appleParams,
    google: googleParams,
    promotionType: activePromotion?.type,
    pointsBalance: ctx.pointsBalance,
    designFields: resolvedDesignFields,
  })

  console.info(
    `[Wallet:Update] serial=${serialNumber}`,
    `apple=${"skipped" in walletResult.apple ? "skipped" : `${walletResult.apple.sent}/${walletResult.apple.total}`}`,
    `google=${"skipped" in walletResult.google ? "skipped" : walletResult.google.ok ? "ok" : "failed"}`,
  )
}
