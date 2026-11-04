import {
  and,
  clientNotes,
  clients,
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

import { undoRewardRedeemed } from "../analytics/update-visits-daily"
import { stampsInCycleOf } from "./stamps"

/** A stamps redemption can be undone this long after it was made. */
export const VOID_WINDOW_MINUTES = 15

export type VoidRedemptionCode =
  | "OK"
  | "NOT_FOUND"
  | "NOT_REDEEMED"
  | "WINDOW_PASSED"
  | "VISITS_AFTER"
  | "FORBIDDEN"
  | "NOT_VOIDABLE"
  | "ALREADY_VOIDED"
  | "CLIENT_ARCHIVED"

export type VoidRedemptionResult = {
  code: VoidRedemptionCode
  /** QR of the client, to refresh the pass after the undo. */
  qrCode?: string | null
  kind?: "final" | "milestone"
  label?: string | null
}

/** Whether a redemption made at `redeemedAt` can still be undone at `now`. */
export function withinVoidWindow(redeemedAt: Date | null, now = new Date()): boolean {
  if (!redeemedAt) return false
  return now.getTime() - redeemedAt.getTime() <= VOID_WINDOW_MINUTES * 60 * 1000
}

/**
 * Undoes a stamps redemption made by mistake at the till (wrong client, the
 * client wanted to keep accumulating). Only right after it: within
 * VOID_WINDOW_MINUTES and with no visit of that client since — after that the
 * card has moved on and the admin fixes it by hand.
 *
 * - Early cash-out ("milestone"): marked voided and its stamps given back.
 * - Full-card reward ("final"): back to pending, ready to be redeemed again.
 *
 * Who: the person who redeemed it, or an admin of the tenant (`canVoidAny`).
 * A note with who, what and why lands in the client's timeline.
 */
export async function voidRedemption(params: {
  rewardId: string
  tenantId: string
  userId: string
  canVoidAny: boolean
  reason: string
}): Promise<VoidRedemptionResult> {
  const { rewardId, tenantId, userId, canVoidAny, reason } = params
  let analytics: { locationId: string; redeemedAt: Date } | null = null

  const result = await db.transaction(async (tx): Promise<VoidRedemptionResult> => {
    const [found] = await tx
      .select({ clientId: rewards.clientId })
      .from(rewards)
      .where(and(eq(rewards.id, rewardId), eq(rewards.tenantId, tenantId)))
      .limit(1)
    if (!found) return { code: "NOT_FOUND" }

    // Same lock order as a visit or a redeem: client first, then the reward.
    const [client] = await tx
      .select({
        id: clients.id,
        qrCode: clients.qrCode,
        status: clients.status,
        totalVisits: clients.totalVisits,
        stampsCashed: clients.stampsCashed,
      })
      .from(clients)
      .where(and(eq(clients.id, found.clientId), eq(clients.tenantId, tenantId)))
      .for("update")
      .limit(1)
    if (!client) return { code: "NOT_FOUND" }
    if (client.status === "archived" || client.status === "deleted") {
      return { code: "CLIENT_ARCHIVED" }
    }

    const [reward] = await tx
      .select()
      .from(rewards)
      .where(eq(rewards.id, rewardId))
      .for("update")
      .limit(1)
    if (!reward) return { code: "NOT_FOUND" }
    if (reward.status !== "redeemed" || !reward.redeemedAt) return { code: "NOT_REDEEMED" }
    // Only stamps redemptions made at the till record who redeemed them: a
    // points-catalog redemption (also a rewards row, no redeemedBy) or an old
    // row cannot be undone here — the points would stay spent.
    if (!reward.redeemedBy || (reward.kind !== "final" && reward.kind !== "milestone")) {
      return { code: "NOT_VOIDABLE" }
    }
    // Each reward can be undone once: redeem → undo → redeem again is not a loop.
    if (reward.voidedAt) return { code: "ALREADY_VOIDED" }
    if (!canVoidAny && reward.redeemedBy !== userId) return { code: "FORBIDDEN" }
    if (!withinVoidWindow(reward.redeemedAt)) return { code: "WINDOW_PASSED" }

    const [later] = await tx
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.clientId, client.id), gt(visits.createdAt, reward.redeemedAt)))
      .limit(1)
    if (later) return { code: "VISITS_AFTER" }

    const isMilestone = reward.kind === "milestone"
    if (isMilestone) {
      // The card must still show exactly what the cash-out left (stamps at
      // redeem minus the milestone). A visit that committed in the same instant
      // can slip past the time check above; this one cannot: giving the stamps
      // back onto a card that moved on could skip the full-card reward.
      const [promotion] = await tx
        .select({ maxVisits: promotions.maxVisits })
        .from(promotions)
        .where(
          and(
            eq(promotions.tenantId, tenantId),
            eq(promotions.type, "stamps"),
            eq(promotions.active, true),
          ),
        )
        .limit(1)
      const maxVisits = promotion?.maxVisits ?? 0
      const expected = (reward.stampsAtRedeem ?? -1) - (reward.milestoneAt ?? 0)
      if (maxVisits <= 0 || reward.stampsAtRedeem == null || reward.milestoneAt == null) {
        return { code: "NOT_VOIDABLE" }
      }
      if (stampsInCycleOf(client, maxVisits) !== expected || reward.stampsAtRedeem >= maxVisits) {
        return { code: "VISITS_AFTER" }
      }
      await tx
        .update(rewards)
        .set({ status: "voided", voidedAt: new Date() })
        .where(eq(rewards.id, reward.id))
      await tx
        .update(clients)
        .set({
          stampsCashed: sql`GREATEST(${clients.stampsCashed} - ${reward.milestoneAt ?? 0}, 0)`,
        })
        .where(eq(clients.id, client.id))
    } else {
      await tx
        .update(rewards)
        // voidedAt stays as the trace that this reward was already undone once.
        .set({ status: "pending", redeemedAt: null, redeemedBy: null, voidedAt: new Date() })
        .where(eq(rewards.id, reward.id))
    }

    const what = isMilestone ? "canje anticipado" : "canje del premio"
    await tx.insert(clientNotes).values({
      clientId: client.id,
      tenantId,
      createdBy: userId,
      content: `Se anuló el ${what}${reward.rewardType ? ` (${reward.rewardType})` : ""}. Motivo: ${reason}`,
    })

    const [lastVisit] = await tx
      .select({ locationId: visits.locationId })
      .from(visits)
      .where(and(eq(visits.clientId, client.id), eq(visits.tenantId, tenantId)))
      .orderBy(desc(visits.createdAt))
      .limit(1)
    if (lastVisit?.locationId) {
      analytics = { locationId: lastVisit.locationId, redeemedAt: reward.redeemedAt }
    }

    return {
      code: "OK",
      qrCode: client.qrCode,
      kind: isMilestone ? "milestone" : "final",
      label: reward.rewardType,
    }
  })

  const undo = analytics as { locationId: string; redeemedAt: Date } | null
  if (result.code === "OK" && undo) {
    const [tenant] = await db
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    undoRewardRedeemed(
      tenantId,
      undo.locationId,
      undo.redeemedAt,
      tenant?.timezone ?? "America/Lima",
    ).catch((err) => console.error("[voidRedemption] undoRewardRedeemed failed:", err))
  }

  return result
}
