import { sendApnsPush } from "../apple/apns"
import { upsertLoyaltyObject } from "../google/loyalty-object"
import type { ApnsPushResult, UpsertResult, WalletUpdateParams, WalletUpdateResult } from "./types"

/**
 * Orchestrate wallet updates after a visit is registered.
 *
 * Sends APNs push notifications (Apple) and upserts the loyalty object (Google)
 * as fire-and-forget operations. NEVER throws — all errors are captured and
 * returned in the result object.
 *
 * @param params - Platform-specific configs (null = skip that platform)
 * @returns Per-platform success/failure status
 */
export async function updateWalletAfterVisit(
  params: WalletUpdateParams,
): Promise<WalletUpdateResult> {
  const appleResult = await updateApple(params)
  const googleResult = await updateGoogle(params)

  return {
    apple: appleResult,
    google: googleResult,
  }
}

async function updateApple(
  params: WalletUpdateParams,
): Promise<ApnsPushResult | { skipped: true; reason: string }> {
  if (!params.apple) {
    return { skipped: true, reason: "Apple config not provided" }
  }

  if (params.apple.deviceTokens.length === 0) {
    return { skipped: true, reason: "No registered Apple devices" }
  }

  try {
    const result = await sendApnsPush({
      deviceTokens: params.apple.deviceTokens,
      passTypeId: params.apple.passTypeId,
      p8KeyPem: params.apple.p8KeyPem,
      teamId: params.apple.teamId,
      keyId: params.apple.keyId,
    })

    console.info(
      `[Wallet:APNs] Push sent for serial=${params.serialNumber}: ${result.sent}/${result.total} succeeded`,
    )

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Wallet:APNs] Push failed for serial=${params.serialNumber}:`, message)
    return { skipped: true, reason: `APNs error: ${message}` }
  }
}

async function updateGoogle(
  params: WalletUpdateParams,
): Promise<UpsertResult | { skipped: true; reason: string }> {
  if (!params.google) {
    return { skipped: true, reason: "Google config not provided" }
  }

  try {
    const result = await upsertLoyaltyObject({
      issuerId: params.google.issuerId,
      classId: params.google.classId,
      serialNumber: params.serialNumber,
      clientName: params.clientName,
      stampsInCycle: params.stampsInCycle,
      maxVisits: params.maxVisits,
      totalVisits: params.totalVisits,
      hasReward: params.hasReward,
      rewardRedeemed: params.rewardRedeemed,
      qrValue: params.google.qrValue,
      accessToken: params.google.accessToken,
      promotionType: params.promotionType,
      designFields: params.designFields,
    })

    if (result.ok) {
      console.info(
        `[Wallet:GoogleUpsert] Updated object=${result.objectId} for serial=${params.serialNumber}`,
      )
    } else {
      console.error(`[Wallet:GoogleUpsert] Failed for serial=${params.serialNumber}:`, result.error)
    }

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Wallet:GoogleUpsert] Error for serial=${params.serialNumber}:`, message)
    return { skipped: true, reason: `Google upsert error: ${message}` }
  }
}
