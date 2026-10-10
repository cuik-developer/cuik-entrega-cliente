import {
  and,
  appleDevices,
  clients,
  db,
  eq,
  passDesigns,
  passInstances,
  promotions,
  tenants,
} from "@cuik/db"
import { stampsPromotionConfigSchema } from "@cuik/shared/validators"
import {
  addLoyaltyObjectMessage,
  buildGoogleClassId,
  getGoogleAccessToken,
} from "@cuik/wallet/google"
import {
  generateETag,
  resolvePassFields,
  type TemplateContext,
  updateWalletAfterVisit,
  validateAppleApnsEnv,
  validateGoogleEnv,
} from "@cuik/wallet/shared"

import { formatExpiry } from "@/lib/loyalty/expiration"
import { allMilestoneMessages } from "@/lib/loyalty/milestones"
import { nextExpiration } from "@/lib/loyalty/points-lots"
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
  /**
   * Anonymized client: last update that expires the pass on the phone. Archived
   * clients are never pushed (their pass simply stops updating).
   */
  expired?: boolean
  /**
   * Intermediate-gift notice ("escalera") for this visit. It travels like a
   * campaign message: stored on the pass instance so the regenerated Apple pass
   * carries it as a changeMessage (lock-screen notification), and sent to
   * Google through addMessage (the only thing that notifies on Android).
   * `null` = no notice this visit: a stale milestone notice is cleared, a real
   * campaign message is left alone.
   */
  milestoneMessage?: string | null
}): Promise<void> {
  const serialNumber = ctx.qrCode

  if (!ctx.expired) {
    const [statusRow] = await db
      .select({ status: clients.status })
      .from(clients)
      .where(eq(clients.id, ctx.clientId))
      .limit(1)
    if (statusRow && (statusRow.status === "archived" || statusRow.status === "deleted")) {
      console.info(`[Wallet:Update] serial=${serialNumber} skipped (client ${statusRow.status})`)
      return
    }
  }

  // Find pass_instances for this client
  const instanceRows = await db
    .select({
      id: passInstances.id,
      serialNumber: passInstances.serialNumber,
      campaignMessage: passInstances.campaignMessage,
      googleObjectId: passInstances.googleObjectId,
      googleSavedAt: passInstances.googleSavedAt,
      googleDeletedAt: passInstances.googleDeletedAt,
    })
    .from(passInstances)
    .where(eq(passInstances.serialNumber, serialNumber))
    .limit(1)

  const instance = instanceRows[0]
  if (!instance) return // No pass instance — nothing to update

  // Get active promotion (type for the loyalty label, config for milestone notices)
  const [activePromotion] = await db
    .select({ type: promotions.type, maxVisits: promotions.maxVisits, config: promotions.config })
    .from(promotions)
    .where(and(eq(promotions.tenantId, ctx.tenantId), eq(promotions.active, true)))
    .limit(1)

  const campaignMessage = nextPassMessage(
    instance.campaignMessage,
    ctx.milestoneMessage,
    activePromotion,
  )

  // Update ETag and lastUpdatedAt
  const now = new Date()
  const etag = generateETag(serialNumber, ctx.totalVisits, now)
  await db
    .update(passInstances)
    .set({
      etag,
      lastUpdatedAt: now,
      ...(campaignMessage !== instance.campaignMessage ? { campaignMessage } : {}),
    })
    .where(eq(passInstances.serialNumber, serialNumber))

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
      const [tenantRow] = await db
        .select({ timezone: tenants.timezone })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1)
      const upcoming =
        activePromotion?.type === "points" ? await nextExpiration(db, ctx.clientId) : null
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
          expiring: upcoming ? upcoming.amount : "",
          expiresAt: upcoming
            ? formatExpiry(upcoming.expiresAt, tenantRow?.timezone ?? "America/Lima")
            : "",
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

  // Registered Apple devices for this serial (also the "is this pass on an
  // iPhone" test for the Google milestone notice, independent of the APNs env).
  const deviceRows = await db
    .select({ pushToken: appleDevices.pushToken })
    .from(appleDevices)
    .where(eq(appleDevices.serialNumber, serialNumber))
  const tokens = deviceRows.map((r) => r.pushToken).filter((t): t is string => !!t)

  const apnsConfig = validateAppleApnsEnv()
  const tenantAppleConfig = await getTenantAppleConfig(ctx.tenantId)
  if (apnsConfig) {
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
    expired: ctx.expired,
  })

  console.info(
    `[Wallet:Update] serial=${serialNumber}`,
    `apple=${"skipped" in walletResult.apple ? "skipped" : `${walletResult.apple.sent}/${walletResult.apple.total}`}`,
    `google=${"skipped" in walletResult.google ? "skipped" : walletResult.google.ok ? "ok" : "failed"}`,
  )

  if (ctx.milestoneMessage && googleParams && tokens.length === 0) {
    await notifyGoogleMilestone({
      serialNumber,
      instance,
      message: ctx.milestoneMessage,
      header: ctx.tenantName,
      accessToken: googleParams.accessToken,
      expired: ctx.expired,
      at: now,
      // The upsert's PUT drops previous messages; if it failed, clear them here.
      upsertCleared: !("skipped" in walletResult.google) && walletResult.google.ok,
    })
  }
}

/**
 * Message the regenerated Apple pass should carry. A milestone notice is written
 * where campaigns write theirs (`campaign_message`). Without a notice this visit,
 * a previous milestone text is dropped (so "tu próxima visita tiene premio" does
 * not outlive the gift) but a campaign message is left alone. `undefined`
 * notice = the caller is not a visit: keep whatever is there.
 */
function nextPassMessage(
  current: string | null,
  notice: string | null | undefined,
  promotion: { type: string; maxVisits: number | null; config: unknown } | undefined,
): string | null {
  if (notice === undefined) return current
  if (notice) return notice
  if (!current || promotion?.type !== "stamps" || !promotion.maxVisits) return current
  const parsed = stampsPromotionConfigSchema.safeParse(promotion.config ?? {})
  if (!parsed.success) return current
  return allMilestoneMessages(parsed.data.stamps, promotion.maxVisits).has(current) ? null : current
}

/**
 * Android notification for a milestone notice. Same audience rule as campaigns:
 * a live Google object and no iPhone holding the pass (checked by the caller).
 * The upsert that precedes it already wiped previous messages (PUT without
 * `messages`), so this is the only one on the pass. Google allows 3 notifying
 * messages per pass per 24 h; past that the text stays on the pass silently.
 */
async function notifyGoogleMilestone(p: {
  serialNumber: string
  instance: {
    googleObjectId: string | null
    googleSavedAt: Date | null
    googleDeletedAt: Date | null
  }
  message: string
  header: string
  accessToken: string
  expired?: boolean
  at: Date
  upsertCleared: boolean
}): Promise<void> {
  const removed =
    p.instance.googleDeletedAt !== null &&
    (!p.instance.googleSavedAt || p.instance.googleDeletedAt > p.instance.googleSavedAt)
  if (!p.instance.googleObjectId || removed || p.expired) return
  const msg = await addLoyaltyObjectMessage({
    objectId: p.instance.googleObjectId,
    header: p.header,
    body: p.message,
    messageId: `milestone-${p.at.getTime()}`,
    accessToken: p.accessToken,
    replacePrevious: !p.upsertCleared,
  })
  console.info(
    `[Wallet:Update] serial=${p.serialNumber} milestone google=${msg.ok ? (msg.notified ? "notified" : "text-only") : "failed"}`,
    msg.ok ? "" : msg.error,
  )
}
