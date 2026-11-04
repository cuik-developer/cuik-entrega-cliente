import { and, clients, count, db, eq, promotions, rewards } from "@cuik/db"
import { stampsPromotionConfigSchema } from "@cuik/shared/validators"

import { cashOutNoticeFor } from "@/lib/loyalty/milestones"
import { stampsInCycleOf } from "@/lib/loyalty/stamps"
import { triggerWalletUpdate } from "./trigger-wallet-update"

/**
 * Redraws a stamps pass from the database (stamps in cycle, pending rewards)
 * and pushes it to Apple and Google. Used after a reward is redeemed or
 * expires, when the visit flow is not there to refresh the pass.
 */
export async function refreshStampsPass(qrCode: string, tenantId: string, tenantName: string) {
  const [[client], [promotion]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        lastName: clients.lastName,
        totalVisits: clients.totalVisits,
        stampsCashed: clients.stampsCashed,
        pointsBalance: clients.pointsBalance,
      })
      .from(clients)
      .where(and(eq(clients.qrCode, qrCode), eq(clients.tenantId, tenantId)))
      .limit(1),
    db
      .select({ maxVisits: promotions.maxVisits, config: promotions.config })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenantId),
          eq(promotions.type, "stamps"),
          eq(promotions.active, true),
        ),
      )
      .limit(1),
  ])
  // No active stamps promotion: nothing sensible to draw ("0 de 0"); leave the pass.
  if (!client || !promotion?.maxVisits) return
  // Counted now, next to the client read, so a visit landing in between cannot
  // leave the pass showing the wrong number of pending rewards.
  const [pending] = await db
    .select({ cnt: count() })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, client.id),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "pending"),
      ),
    )
  const pendingRewards = Number(pending?.cnt ?? 0)
  const maxVisits = promotion.maxVisits
  const stampsInCycle = stampsInCycleOf(client, maxVisits)
  const config = stampsPromotionConfigSchema.safeParse(promotion.config ?? {})
  await triggerWalletUpdate({
    qrCode,
    clientId: client.id,
    clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
    tenantId,
    tenantName,
    stampsInCycle,
    maxVisits,
    totalVisits: client.totalVisits,
    pendingRewards,
    pointsBalance: client.pointsBalance,
    // The early cash-out text when it can still be taken (after an undo, for
    // example); otherwise null, which drops a milestone / "Tarjeta completa"
    // notice and keeps a real campaign message (see nextPassMessage).
    milestoneMessage: config.success
      ? cashOutNoticeFor(config.data.stamps, maxVisits, stampsInCycle)
      : null,
  })
}
