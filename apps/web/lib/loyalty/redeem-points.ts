import {
  and,
  clients,
  db,
  eq,
  pointsTransactions,
  promotions,
  rewardCatalog,
  rewards,
} from "@cuik/db"

import type { PointsRedeemResult } from "./types"

export async function redeemPoints(params: {
  qrCode: string
  tenantId: string
  catalogItemId: string
  cashierId: string
}): Promise<PointsRedeemResult> {
  const { qrCode, tenantId, catalogItemId } = params

  const result = await db.transaction(async (tx) => {
    // 1. Find client with FOR UPDATE lock
    const clientRows = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.qrCode, qrCode), eq(clients.tenantId, tenantId)))
      .for("update")
      .limit(1)

    const client = clientRows[0]
    if (!client) {
      return { code: "CLIENT_NOT_FOUND" as const }
    }

    // 2. Check for active points promotion
    const promoRows = await tx
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenantId),
          eq(promotions.type, "points"),
          eq(promotions.active, true),
        ),
      )
      .limit(1)

    if (!promoRows[0]) {
      return { code: "NO_ACTIVE_PROMOTION" as const }
    }

    // 3. Find catalog item — must be active and belong to this tenant
    const catalogRows = await tx
      .select()
      .from(rewardCatalog)
      .where(and(eq(rewardCatalog.id, catalogItemId), eq(rewardCatalog.tenantId, tenantId)))
      .limit(1)

    const catalogItem = catalogRows[0]
    if (!catalogItem) {
      return { code: "CATALOG_ITEM_NOT_FOUND" as const }
    }

    if (!catalogItem.active) {
      return { code: "CATALOG_ITEM_INACTIVE" as const }
    }

    // 4. Check sufficient points
    if (client.pointsBalance < catalogItem.pointsCost) {
      return { code: "INSUFFICIENT_POINTS" as const }
    }

    // 5. Deduct points from client balance
    const newBalance = client.pointsBalance - catalogItem.pointsCost
    await tx.update(clients).set({ pointsBalance: newBalance }).where(eq(clients.id, client.id))

    // 6. Insert points transaction (redeem = negative amount)
    await tx.insert(pointsTransactions).values({
      clientId: client.id,
      tenantId,
      amount: -catalogItem.pointsCost,
      type: "redeem",
      catalogItemId: catalogItem.id,
      description: catalogItem.name,
    })

    // 7. Create reward record (immediately redeemed)
    const now = new Date()
    await tx.insert(rewards).values({
      clientId: client.id,
      tenantId,
      cycleNumber: 1,
      rewardType: catalogItem.name,
      status: "redeemed",
      redeemedAt: now,
    })

    // 8. Return success
    return {
      code: "OK" as const,
      catalogItem: {
        id: catalogItem.id,
        name: catalogItem.name,
        pointsCost: catalogItem.pointsCost,
      },
      points: {
        deducted: catalogItem.pointsCost,
        newBalance,
      },
    }
  })

  return result
}
