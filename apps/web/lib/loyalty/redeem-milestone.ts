import {
  and,
  clients,
  count,
  db,
  desc,
  eq,
  gt,
  promotions,
  rewards,
  sql,
  tenants,
  visits,
} from "@cuik/db"
import { stampsPromotionConfigSchema } from "@cuik/shared/validators"

import { updateRewardsRedeemed } from "../analytics/update-visits-daily"
import { cashOutOfferFor } from "./milestones"
import { DUPLICATE_REWARD_REDEEM_WINDOW_SECONDS } from "./redeem-reward"
import { cyclesCompletedOf, stampsInCycleOf } from "./stamps"

export type MilestoneRedeemCode =
  | "OK"
  | "NOT_AVAILABLE"
  | "DUPLICATE_REDEEM"
  | "NO_ACTIVE_PROMOTION"
  | "CLIENT_NOT_FOUND"
  | "CLIENT_BLOCKED"
  | "CLIENT_ARCHIVED"

export type MilestoneRedeemResult = {
  code: MilestoneRedeemCode
  reward?: { id: string; label: string; redeemedAt: Date }
  /** Card after the cash-out: `current` = stamps left. */
  stamps?: { current: number; max: number }
  /** Stamps the client had when cashing out. */
  stampsAtRedeem?: number
  pendingRewards?: number
}

/**
 * Early cash-out ("escalera canjeable"): the client takes the intermediate
 * reward instead of waiting for the full card. Records a redeemed reward of
 * kind "milestone" and spends `at` stamps (7 stamps at a milestone of 5 leave
 * 2). Allowed from the milestone until the stamp before the full card.
 *
 * Locks the client row like a visit and a regular redeem, so a visit or a
 * second tap on another till waits for this one; a redeem of the same client
 * seconds ago is a double tap, not a second cash-out.
 */
export async function redeemMilestone(params: {
  qrCode: string
  tenantId: string
  cashierId: string
}): Promise<MilestoneRedeemResult> {
  const { qrCode, tenantId, cashierId } = params
  let analyticsLocationId: string | null = null

  const result = await db.transaction(async (tx): Promise<MilestoneRedeemResult> => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.qrCode, qrCode), eq(clients.tenantId, tenantId)))
      .for("update")
      .limit(1)
    if (!client) return { code: "CLIENT_NOT_FOUND" }
    if (client.status !== "active" && client.status !== "inactive") {
      return { code: client.status === "blocked" ? "CLIENT_BLOCKED" : "CLIENT_ARCHIVED" }
    }

    const [recent] = await tx
      .select({ id: rewards.id })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenantId),
          eq(rewards.status, "redeemed"),
          // A full-card redeem just before is a different action, not a double tap.
          eq(rewards.kind, "milestone"),
          gt(
            rewards.redeemedAt,
            new Date(Date.now() - DUPLICATE_REWARD_REDEEM_WINDOW_SECONDS * 1000),
          ),
        ),
      )
      .limit(1)
    if (recent) return { code: "DUPLICATE_REDEEM" }

    const [promotion] = await tx
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenantId),
          eq(promotions.type, "stamps"),
          eq(promotions.active, true),
        ),
      )
      .limit(1)
    if (!promotion?.maxVisits) return { code: "NO_ACTIVE_PROMOTION" }

    const maxVisits = promotion.maxVisits
    const config = stampsPromotionConfigSchema.parse(promotion.config ?? {})
    const offer = cashOutOfferFor(config.stamps, maxVisits, stampsInCycleOf(client, maxVisits))
    if (!offer) return { code: "NOT_AVAILABLE" }

    const now = new Date()
    const [reward] = await tx
      .insert(rewards)
      .values({
        clientId: client.id,
        tenantId,
        cycleNumber: cyclesCompletedOf(client, maxVisits) + 1,
        rewardType: offer.label,
        kind: "milestone",
        milestoneAt: offer.at,
        stampsAtRedeem: offer.stamps,
        status: "redeemed",
        redeemedAt: now,
        redeemedBy: cashierId,
      })
      .returning({ id: rewards.id })

    await tx
      .update(clients)
      .set({ stampsCashed: sql`${clients.stampsCashed} + ${offer.at}` })
      .where(eq(clients.id, client.id))

    const [pending] = await tx
      .select({ cnt: count() })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenantId),
          eq(rewards.status, "pending"),
        ),
      )

    const [lastVisit] = await tx
      .select({ locationId: visits.locationId })
      .from(visits)
      .where(and(eq(visits.clientId, client.id), eq(visits.tenantId, tenantId)))
      .orderBy(desc(visits.createdAt))
      .limit(1)
    analyticsLocationId = lastVisit?.locationId ?? null

    return {
      code: "OK",
      reward: { id: reward.id, label: offer.label, redeemedAt: now },
      stamps: { current: offer.stampsAfter, max: maxVisits },
      stampsAtRedeem: offer.stamps,
      pendingRewards: pending?.cnt ?? 0,
    }
  })

  if (result.code === "OK" && analyticsLocationId) {
    const [tenant] = await db
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    updateRewardsRedeemed(
      tenantId,
      analyticsLocationId,
      new Date(),
      tenant?.timezone ?? "America/Lima",
    ).catch((err) => console.error("[redeemMilestone] updateRewardsRedeemed failed:", err))
  }

  return result
}
