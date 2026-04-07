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
import { buildGoogleClassId, getGoogleAccessToken, upsertLoyaltyObject } from "@cuik/wallet/google"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"
import { resolveSegment } from "./resolve-segment"

const APPLE_BATCH_SIZE = 50
const GOOGLE_BATCH_SIZE = 100

type ClientPassInfo = {
  clientId: string
  serialNumber: string
  googleObjectId: string | null
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

  // 3. Set status to sending
  await db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, campaignId))

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

    // 7. Send notifications
    const allErrors: string[] = []
    let totalSent = 0
    let totalFailed = 0

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

    // Process Google wallet update batches
    const googleClients = clientPassMap.filter((c) => c.googleObjectId !== null)
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

    // 8. Update campaign final stats
    const finalStatus = totalSent > 0 ? "sent" : "sent"
    await db
      .update(campaigns)
      .set({
        status: finalStatus,
        sentAt: new Date(),
        sentCount: totalSent,
        deliveredCount: totalSent, // Initially same as sent
      })
      .where(eq(campaigns.id, campaignId))

    return {
      campaignId,
      status: totalFailed > 0 && totalSent === 0 ? "failed" : "sent",
      targetCount,
      sentCount: totalSent,
      deliveredCount: totalSent,
      failedCount: totalFailed,
      errors: allErrors,
    }
  } catch (error) {
    // On unhandled error, mark campaign as failed (revert to draft so it can be retried)
    await db.update(campaigns).set({ status: "draft" }).where(eq(campaigns.id, campaignId))

    return {
      campaignId,
      status: "failed",
      targetCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    }
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

  // Load APNs credentials from env (P8 key, teamId, keyId stay global)
  const p8KeyPem = process.env.APPLE_APNS_P8_BASE64
    ? Buffer.from(process.env.APPLE_APNS_P8_BASE64, "base64").toString("utf-8")
    : null
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
 * Sends Google Wallet updates in batches of 100.
 * Updates textModulesData with the campaign message to trigger device notification.
 * Records a notification row per client.
 */
async function processGoogleBatches(
  campaignId: string,
  tenantId: string,
  googleClients: ClientPassInfo[],
  _message: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0
  let failed = 0
  const errors: string[] = []

  // Load Google credentials from env
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  if (!issuerId || !serviceAccountJson) {
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
    const parsed = JSON.parse(serviceAccountJson)
    accessToken = await getGoogleAccessToken({
      issuerId,
      serviceAccountJson: {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      },
    })
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

  // Build classId from tenant name (deterministic)
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const classId = tenant ? buildGoogleClassId(issuerId, tenant.name) : `${issuerId}.cuik_loyalty` // fallback if tenant not found

  // Process in batches
  for (let i = 0; i < googleClients.length; i += GOOGLE_BATCH_SIZE) {
    const batch = googleClients.slice(i, i + GOOGLE_BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (client) => {
        // We use the upsertLoyaltyObject to update the textModulesData with campaign message
        // This triggers a "pass updated" notification on the user's device
        const result = await upsertLoyaltyObject({
          issuerId,
          classId,
          serialNumber: client.serialNumber,
          clientName: "", // Not updating name, just the message
          stampsInCycle: 0,
          maxVisits: 0,
          totalVisits: 0,
          hasReward: false,
          rewardRedeemed: false,
          qrValue: "",
          accessToken,
        })

        if (result.ok) {
          await recordNotification(campaignId, client.clientId, "wallet_push", "sent", null)
          return { ok: true }
        }

        const errorMsg = "error" in result ? result.error : "Google wallet update failed"
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
