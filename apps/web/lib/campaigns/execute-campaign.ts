import {
  appleDevices,
  campaignSegments,
  campaigns,
  db,
  eq,
  notifications,
  passInstances,
  sql,
  tenants,
} from "@cuik/db"
import type { CampaignExecutionResult, SegmentFilter } from "@cuik/shared/types/campaign"
import { sendApnsPush } from "@cuik/wallet/apple"
import { addLoyaltyObjectMessage, getGoogleAccessToken } from "@cuik/wallet/google"
import { resolveTemplate, validateGoogleEnv } from "@cuik/wallet/shared"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"
import { buildClientTemplateContexts } from "./client-template-context"
import { resolveSegment } from "./resolve-segment"

const APPLE_BATCH_SIZE = 50
// Google: 3 HTTP calls per client (GET, PUT, addMessage); 100 in flight tripped
// the per-minute rate limit on large tenants.
const GOOGLE_BATCH_SIZE = 25

type ClientPassInfo = {
  clientId: string
  serialNumber: string
  googleObjectId: string | null
  /** Google's "del" callback is newer than its last "save": the pass is gone from the phone. */
  googleRemoved: boolean
  appleDeviceTokens: string[]
}

/**
 * Executes a campaign end-to-end:
 * 1. Validates campaign status
 * 2. Resolves segment to client IDs
 * 3. Finds pass instances for each client
 * 4. Sends push notifications in batches (Apple APNs + Google Wallet)
 * 5. Records notifications in DB
 * 6. Updates campaign stats
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear pipeline (claim → audience → dispatch → finalize) whose branches are the failure modes; splitting it would hide the status transitions
export async function executeCampaign(campaignId: string): Promise<CampaignExecutionResult> {
  // 1. Load campaign + segment
  const campaignRows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  const campaign = campaignRows[0]
  if (!campaign) {
    return {
      campaignId,
      status: "failed",
      targetCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      errors: ["Campaign not found"],
    }
  }

  // 2. Verify status
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return {
      campaignId,
      status: "failed",
      targetCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      errors: [`Campaign status is '${campaign.status}', expected 'draft' or 'scheduled'`],
    }
  }

  // 3. Claim the campaign atomically: only ONE caller can move it from
  //    draft/scheduled to sending. The cron tick and a manual "Enviar" (or two
  //    overlapping ticks) used to both pass the read-then-write check above and
  //    push every recipient twice. The original status is kept so an early
  //    failure restores it (a scheduled campaign must stay retryable).
  const originalStatus = campaign.status
  const claimed = await db
    .update(campaigns)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      sql`${campaigns.id} = ${campaignId}::uuid AND ${campaigns.status} IN ('draft', 'scheduled')`,
    )
    .returning({ id: campaigns.id })
  if (claimed.length === 0) {
    return {
      campaignId,
      status: "failed",
      targetCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      errors: ["Campaign is already being sent by another process"],
    }
  }

  // Hoisted so the catch block knows whether pushes already went out.
  const allErrors: string[] = []
  let totalSent = 0
  let totalFailed = 0
  let dispatchStarted = false

  try {
    // 4. Load segment filter
    const segmentRows = await db
      .select()
      .from(campaignSegments)
      .where(eq(campaignSegments.campaignId, campaignId))
      .limit(1)

    const segmentFilter = (segmentRows[0]?.filter ?? { preset: "todos" }) as SegmentFilter

    // 4b. Load tenant for segmentation thresholds
    const tenantRows = await db
      .select({
        businessType: tenants.businessType,
        segmentationConfig: tenants.segmentationConfig,
      })
      .from(tenants)
      .where(eq(tenants.id, campaign.tenantId))
      .limit(1)
    const tenantData = tenantRows[0]
    const segConfig = tenantData?.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenantData?.businessType, segConfig)

    // 5. Resolve segment
    const { clientIds, count: targetCount } = await resolveSegment(
      campaign.tenantId,
      segmentFilter,
      thresholds,
    )

    // Update target count
    await db.update(campaigns).set({ targetCount }).where(eq(campaigns.id, campaignId))

    if (clientIds.length === 0) {
      await db
        .update(campaigns)
        .set({
          status: "sent",
          sentAt: new Date(),
          sentCount: 0,
          deliveredCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId))

      return {
        campaignId,
        status: "sent",
        targetCount: 0,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        errors: [],
      }
    }

    // 6. Find pass instances for clients
    const clientPassMap = await getClientPassInfo(clientIds)

    // 6b. Update pass_instances to trigger a refresh
    // For "push" campaigns: write campaignMessage so the pass includes a changeMessage (visible notification)
    // For "wallet_update" campaigns: only bump etag (silent refresh, no visible notification)
    const message = campaign.message ?? ""
    const serials = clientPassMap.map((c) => c.serialNumber)
    if (serials.length > 0) {
      const isWalletUpdate = campaign.type === "wallet_update"
      const newCampaignMessage = isWalletUpdate ? null : message || null
      console.info(
        `[Campaign:DB] Updating ${serials.length} pass instances: campaignMessage=${JSON.stringify(newCampaignMessage)}, isWalletUpdate=${isWalletUpdate}`,
      )
      await db
        .update(passInstances)
        .set({
          campaignMessage: newCampaignMessage,
          etag: null,
          lastUpdatedAt: new Date(),
        })
        .where(
          sql`${passInstances.serialNumber} IN (${sql.join(
            serials.map((s) => sql`${s}`),
            sql`, `,
          )})`,
        )
    }

    // 7. Send notifications. From here on, a thrown error must NOT restore
    //    draft/scheduled: some recipients may already have been pushed.
    dispatchStarted = true

    // Process Apple push batches
    const appleClients = clientPassMap.filter((c) => c.appleDeviceTokens.length > 0)
    const totalAppleTokens = appleClients.reduce((n, c) => n + c.appleDeviceTokens.length, 0)
    const googleObjectCount = clientPassMap.filter((c) => c.googleObjectId !== null).length
    console.info(
      `[Campaign:Dispatch] clients=${clientPassMap.length} appleClients=${appleClients.length} appleTokens=${totalAppleTokens} googleObjects=${googleObjectCount}`,
    )
    if (appleClients.length > 0) {
      const appleResult = await processAppleBatches(
        campaignId,
        campaign.tenantId,
        appleClients,
        campaign.message ?? "",
      )
      totalSent += appleResult.sent
      totalFailed += appleResult.failed
      allErrors.push(...appleResult.errors)
    }

    // Process Google Wallet message batches. Google only notifies through
    // addMessage, so a silent "wallet_update" has nothing to send on Android:
    // those passes refresh on the next visit (triggerWalletUpdate).
    // Every client gets a Google object at registration, so "Android" = has the
    // object, no iPhone registered the pass, and Google has not reported it
    // removed (save/delete callback). Same rule as the wallet-distribution chart.
    const googleClients =
      campaign.type === "wallet_update"
        ? []
        : clientPassMap.filter(
            (c) =>
              c.googleObjectId !== null && !c.googleRemoved && c.appleDeviceTokens.length === 0,
          )
    if (googleClients.length > 0) {
      const googleResult = await processGoogleBatches(
        campaignId,
        campaign.tenantId,
        googleClients,
        campaign.message ?? "",
      )
      totalSent += googleResult.sent
      totalFailed += googleResult.failed
      allErrors.push(...googleResult.errors)
    }

    // 8. Final status. Nothing delivered at all (credentials down, every push
    //    rejected) is a FAILURE, not a send: the campaign goes back to draft
    //    with the error on the row so the admin can fix the cause and send
    //    again. It is not re-queued as scheduled on purpose: a broken
    //    certificate would otherwise retry every 5 minutes forever.
    const nothingDelivered = totalSent === 0 && totalFailed > 0
    await db
      .update(campaigns)
      .set(
        nothingDelivered
          ? {
              status: "draft",
              sentAt: null,
              sentCount: 0,
              deliveredCount: 0,
              content: withLastError(campaign.content, allErrors),
              updatedAt: new Date(),
            }
          : {
              status: "sent",
              sentAt: new Date(),
              sentCount: totalSent,
              deliveredCount: totalSent, // Initially same as sent
              updatedAt: new Date(),
            },
      )
      .where(eq(campaigns.id, campaignId))

    return {
      campaignId,
      status: nothingDelivered ? "failed" : "sent",
      targetCount,
      sentCount: totalSent,
      deliveredCount: totalSent,
      failedCount: totalFailed,
      errors: allErrors,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (dispatchStarted) {
      // Pushes may already be out: finalize with what was counted instead of
      // restoring "scheduled" (which would re-send to everyone on the next tick).
      await db
        .update(campaigns)
        .set({
          status: "sent",
          sentAt: new Date(),
          sentCount: totalSent,
          deliveredCount: totalSent,
          content: withLastError(campaign.content, [...allErrors, message]),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId))
      return {
        campaignId,
        status: totalSent > 0 ? "sent" : "failed",
        targetCount: 0,
        sentCount: totalSent,
        deliveredCount: totalSent,
        failedCount: totalFailed,
        errors: [...allErrors, message],
      }
    }

    // Nothing was sent yet: restore the ORIGINAL status (draft or scheduled).
    // Restoring to "scheduled" preserves the cron retry for transient errors.
    await db
      .update(campaigns)
      .set({ status: originalStatus, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId))

    return {
      campaignId,
      status: "failed",
      targetCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      errors: [message],
    }
  }
}

/** Keeps whatever the row already carries in `content` and records the last error. */
function withLastError(content: unknown, errors: string[]) {
  const base = content && typeof content === "object" ? (content as Record<string, unknown>) : {}
  return {
    ...base,
    lastError: errors.slice(0, 5).join("; ").slice(0, 1000),
    lastErrorAt: new Date().toISOString(),
  }
}

/**
 * Queries pass_instances and apple_devices to gather push info for each client.
 */
async function getClientPassInfo(clientIds: string[]): Promise<ClientPassInfo[]> {
  // Fetch pass instances for these clients
  const passRows = await db
    .select({
      clientId: passInstances.clientId,
      serialNumber: passInstances.serialNumber,
      googleObjectId: passInstances.googleObjectId,
      googleSavedAt: passInstances.googleSavedAt,
      googleDeletedAt: passInstances.googleDeletedAt,
    })
    .from(passInstances)
    .where(
      sql`${passInstances.clientId} IN (${sql.join(
        clientIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )

  if (passRows.length === 0) return []

  // Fetch apple device tokens for pass serial numbers
  const serialNumbers = passRows.map((p) => p.serialNumber)
  const deviceRows = await db
    .select({
      serialNumber: appleDevices.serialNumber,
      pushToken: appleDevices.pushToken,
    })
    .from(appleDevices)
    .where(
      sql`${appleDevices.serialNumber} IN (${sql.join(
        serialNumbers.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    )

  // Group device tokens by serial number
  const deviceTokenMap = new Map<string, string[]>()
  for (const row of deviceRows) {
    if (!row.pushToken) continue
    const existing = deviceTokenMap.get(row.serialNumber) ?? []
    existing.push(row.pushToken)
    deviceTokenMap.set(row.serialNumber, existing)
  }

  // Build client pass info
  return passRows.map((pass) => ({
    clientId: pass.clientId,
    serialNumber: pass.serialNumber,
    googleObjectId: pass.googleObjectId,
    googleRemoved:
      pass.googleDeletedAt !== null &&
      pass.googleDeletedAt !== undefined &&
      (!pass.googleSavedAt || pass.googleDeletedAt > pass.googleSavedAt),
    appleDeviceTokens: deviceTokenMap.get(pass.serialNumber) ?? [],
  }))
}

/**
 * Sends Apple APNs push in batches of 50.
 * Records a notification row per client.
 */
async function processAppleBatches(
  campaignId: string,
  tenantId: string,
  appleClients: ClientPassInfo[],
  _message: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0
  let failed = 0
  const errors: string[] = []

  // Load APNs credentials from env (P8 key, teamId, keyId stay global).
  // Tolerate either base64-encoded PEM (preferred) or raw PEM pasted directly
  // into the env var. Normalize line endings for jose.
  const rawP8 = process.env.APPLE_APNS_P8_BASE64 ?? ""
  let p8KeyPem: string | null = null
  if (rawP8) {
    const candidate = rawP8.includes("-----BEGIN")
      ? rawP8
      : Buffer.from(rawP8, "base64").toString("utf-8")
    p8KeyPem = candidate.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
  }
  const teamId = process.env.APPLE_APNS_TEAM_ID
  const keyId = process.env.APPLE_APNS_KEY_ID

  // Resolve per-tenant passTypeId (APNs topic) with env fallback
  const tenantConfig = await getTenantAppleConfig(tenantId)
  const passTypeId = tenantConfig?.passTypeId ?? process.env.APPLE_APNS_TOPIC ?? null

  if (!p8KeyPem || !teamId || !keyId || !passTypeId) {
    // Record all as failed
    for (const client of appleClients) {
      await recordNotification(
        campaignId,
        client.clientId,
        "wallet_push",
        "failed",
        "Apple credentials not configured",
      )
    }
    return { sent: 0, failed: appleClients.length, errors: ["Apple credentials not configured"] }
  }

  // Process in batches
  for (let i = 0; i < appleClients.length; i += APPLE_BATCH_SIZE) {
    const batch = appleClients.slice(i, i + APPLE_BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (client) => {
        const result = await sendApnsPush({
          deviceTokens: client.appleDeviceTokens,
          passTypeId,
          p8KeyPem,
          teamId,
          keyId,
        })

        if (result.sent > 0) {
          await recordNotification(campaignId, client.clientId, "wallet_push", "sent", null)
          return { ok: true }
        }

        const errorMsg = result.results
          .filter((r) => !r.ok)
          .map((r) => r.error)
          .join("; ")
        await recordNotification(
          campaignId,
          client.clientId,
          "wallet_push",
          "failed",
          errorMsg || "Push failed",
        )
        return { ok: false, error: errorMsg }
      }),
    )

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        sent++
      } else {
        failed++
        if (result.status === "rejected") {
          errors.push(String(result.reason))
        }
      }
    }
  }

  return { sent, failed, errors }
}

/**
 * Sends the campaign message to Google Wallet passes in batches of 100.
 *
 * Google does not notify on object updates: the Android push only happens
 * through `addMessage` with TEXT_AND_NOTIFY. The message is resolved per
 * client here ({{client.name}}, {{points.balance}}...) because Google has no
 * download hook like Apple's web service. Records a notification row per client.
 */
async function processGoogleBatches(
  campaignId: string,
  tenantId: string,
  googleClients: ClientPassInfo[],
  message: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0
  let failed = 0
  const errors: string[] = []

  if (!message.trim()) {
    for (const client of googleClients) {
      await recordNotification(
        campaignId,
        client.clientId,
        "wallet_push",
        "failed",
        "Empty message",
      )
    }
    return { sent: 0, failed: googleClients.length, errors: ["Empty message"] }
  }

  // Same env as registration and visit updates (GOOGLE_WALLET_ISSUER_ID +
  // GOOGLE_WALLET_SA_JSON_B64). The executor used to read a plain-text
  // GOOGLE_SERVICE_ACCOUNT_JSON that prod never had, so every Android send failed.
  const googleConfig = validateGoogleEnv()

  if (!googleConfig) {
    for (const client of googleClients) {
      await recordNotification(
        campaignId,
        client.clientId,
        "wallet_push",
        "failed",
        "Google credentials not configured",
      )
    }
    return { sent: 0, failed: googleClients.length, errors: ["Google credentials not configured"] }
  }

  // Get access token for all Google operations
  let accessToken: string
  try {
    accessToken = await getGoogleAccessToken(googleConfig)
  } catch (_err) {
    for (const client of googleClients) {
      await recordNotification(
        campaignId,
        client.clientId,
        "wallet_push",
        "failed",
        "Failed to get Google access token",
      )
    }
    return { sent: 0, failed: googleClients.length, errors: ["Failed to get Google access token"] }
  }

  // Business name as the message header + per-client variables for the body
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const header = tenant?.name ?? "Cuik"
  const contexts = await buildClientTemplateContexts(
    tenantId,
    googleClients.map((c) => c.clientId),
  )

  // Process in batches
  for (let i = 0; i < googleClients.length; i += GOOGLE_BATCH_SIZE) {
    const batch = googleClients.slice(i, i + GOOGLE_BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (client) => {
        const context = contexts.get(client.clientId) ?? { client: { name: "" } }
        const body = resolveTemplate(message, context)
        const result = await addLoyaltyObjectMessage({
          objectId: client.googleObjectId as string,
          header,
          body,
          messageId: campaignId,
          accessToken,
        })

        if (result.ok && result.notified) {
          await recordNotification(campaignId, client.clientId, "wallet_push", "sent", null)
          return { ok: true }
        }

        const errorMsg = result.ok
          ? "Google: cuota de 3 notificaciones por 24 h agotada; el mensaje quedó en el pase sin aviso"
          : result.error
        await recordNotification(campaignId, client.clientId, "wallet_push", "failed", errorMsg)
        return { ok: false, error: errorMsg }
      }),
    )

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        sent++
      } else {
        failed++
        if (result.status === "rejected") {
          errors.push(String(result.reason))
        }
      }
    }
  }

  return { sent, failed, errors }
}

/**
 * Records a notification row for campaign delivery tracking.
 */
async function recordNotification(
  campaignId: string,
  clientId: string,
  channel: "wallet_push" | "email",
  status: "sent" | "delivered" | "failed",
  error: string | null,
) {
  await db.insert(notifications).values({
    campaignId,
    clientId,
    channel,
    status,
    error,
    sentAt: new Date(),
  })
}
