import {
  and,
  asc,
  clients,
  count,
  db,
  desc,
  eq,
  or,
  rewards,
  sql,
  tenants,
  visits,
} from "@cuik/db"

import { updateRewardsRedeemed } from "../analytics/update-visits-daily"
import type { RedeemResult } from "./types"

export async function redeemReward(params: {
  qrCode: string
  tenantId: string
  cashierId: string
}): Promise<RedeemResult> {
  const { qrCode, tenantId } = params

  // We'll capture the info needed for analytics after the transaction
  let resolvedLocationId: string | null = null

  const result = await db.transaction(async (tx) => {
    // 1. Find client
    const clientRows = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.qrCode, qrCode), eq(clients.tenantId, tenantId)))
      .limit(1)

    const client = clientRows[0]
    if (!client) {
      return {
        code: "CLIENT_NOT_FOUND" as const,
        remainingPendingRewards: 0,
      }
    }

    // 2a. Expire any past-due pending rewards for this client
    await tx
      .update(rewards)
      .set({ status: "expired" })
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenantId),
          eq(rewards.status, "pending"),
          sql`${rewards.expiresAt} IS NOT NULL AND ${rewards.expiresAt} <= NOW()`,
        ),
      )

    // 2b. Find oldest pending reward that hasn't expired, with FOR UPDATE lock
    const pendingRows = await tx
      .select()
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenantId),
          eq(rewards.status, "pending"),
          or(sql`${rewards.expiresAt} IS NULL`, sql`${rewards.expiresAt} > NOW()`),
        ),
      )
      .orderBy(asc(rewards.createdAt))
      .for("update")
      .limit(1)

    const reward = pendingRows[0]
    if (!reward) {
      return {
        code: "NO_PENDING_REWARD" as const,
        remainingPendingRewards: 0,
      }
    }

    // 3. Mark as redeemed
    const now = new Date()
    await tx
      .update(rewards)
      .set({
        status: "redeemed",
        redeemedAt: now,
      })
      .where(eq(rewards.id, reward.id))

    // 4. Count remaining pending
    const remainingCount = await tx
      .select({ cnt: count() })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenantId),
          eq(rewards.status, "pending"),
        ),
      )

    // 5. Get last visit's locationId for analytics context
    const lastVisit = await tx
      .select({ locationId: visits.locationId })
      .from(visits)
      .where(and(eq(visits.clientId, client.id), eq(visits.tenantId, tenantId)))
      .orderBy(desc(visits.createdAt))
      .limit(1)

    resolvedLocationId = lastVisit[0]?.locationId ?? null

    return {
      code: "OK" as const,
      reward: {
        id: reward.id,
        cycleNumber: reward.cycleNumber,
        rewardType: reward.rewardType,
        redeemedAt: now,
      },
      remainingPendingRewards: remainingCount[0]?.cnt ?? 0,
    }
  })

  // Fire-and-forget: increment rewardsRedeemed counter after transaction commits
  if (result.code === "OK" && resolvedLocationId) {
    const tenantRows = await db
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    const tenantTz = tenantRows[0]?.timezone ?? "America/Lima"

    updateRewardsRedeemed(tenantId, resolvedLocationId, new Date(), tenantTz).catch((err) =>
      console.error("[redeemReward] updateRewardsRedeemed failed:", err),
    )
  }

  return result
}
