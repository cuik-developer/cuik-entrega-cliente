import {
  and,
  clients,
  count,
  db,
  eq,
  promotions,
  rewardCatalog,
  rewards,
  sql,
  visits,
} from "@cuik/db"
import { pointsPromotionConfigSchema, stampsPromotionConfigSchema } from "@cuik/shared/validators"
import type { SegmentationThresholds } from "./client-segments"
import { computeClientSegment } from "./client-segments"
import { computeTier, getNextTier } from "./rules-engine"
import type { ClientStatus } from "./types"

export async function getClientStatus(params: {
  clientId: string
  tenantId: string
  thresholds?: SegmentationThresholds
}): Promise<ClientStatus | null> {
  const { clientId, tenantId, thresholds } = params

  // 1. Get client
  const clientRows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1)

  const client = clientRows[0]
  if (!client) return null

  // 2. Get active promotion (any type)
  const promoRows = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .limit(1)

  const promotion = promoRows[0]
  const isPoints = promotion?.type === "points"

  // 3. Parse promotion config for tier computation
  const config = promotion
    ? isPoints
      ? pointsPromotionConfigSchema.parse(promotion.config ?? {})
      : stampsPromotionConfigSchema.parse(promotion.config ?? {})
    : null

  // 4. Count pending rewards
  const pendingCount = await db
    .select({ cnt: count() })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, clientId),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "pending"),
      ),
    )

  // 5. Count expired rewards
  const expiredCount = await db
    .select({ cnt: count() })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, clientId),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "expired"),
      ),
    )

  // 6. Find nearest expiration among pending rewards
  const nearestExpiration = await db
    .select({ expiresAt: rewards.expiresAt })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, clientId),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "pending"),
        sql`${rewards.expiresAt} IS NOT NULL`,
      ),
    )
    .orderBy(rewards.expiresAt)
    .limit(1)

  // 7. Compute tier info
  const currentTier = config ? computeTier(config, client.totalVisits) : null
  const nextTierInfo = config ? getNextTier(config, client.totalVisits) : null

  // 8. Calculate stamps (only relevant for stamps promotions)
  const stampsInCycle =
    !isPoints && promotion?.maxVisits ? client.totalVisits % promotion.maxVisits : null
  const stampsMax = !isPoints ? (promotion?.maxVisits ?? null) : null

  // 9. For points promotions, count available catalog items
  let pointsData: { balance: number; availableCatalogItems?: number } | undefined
  if (isPoints) {
    const availableItems = await db
      .select({ cnt: count() })
      .from(rewardCatalog)
      .where(
        and(
          eq(rewardCatalog.tenantId, tenantId),
          eq(rewardCatalog.active, true),
          sql`${rewardCatalog.pointsCost} <= ${client.pointsBalance}`,
        ),
      )

    pointsData = {
      balance: client.pointsBalance,
      availableCatalogItems: availableItems[0]?.cnt ?? 0,
    }
  }

  // 10. Compute visit frequency for segment
  const visitStats = await db
    .select({
      lastVisitAt: sql<Date | null>`MAX(${visits.createdAt})`,
      avgDaysBetweenVisits: sql<number | null>`
        CASE
          WHEN COUNT(*) <= 1 THEN NULL
          ELSE EXTRACT(EPOCH FROM (MAX(${visits.createdAt}) - MIN(${visits.createdAt})))
            / (COUNT(*) - 1) / 86400.0
        END
      `,
    })
    .from(visits)
    .where(and(eq(visits.clientId, clientId), eq(visits.tenantId, tenantId)))

  const lastVisitAt = visitStats[0]?.lastVisitAt ? new Date(visitStats[0].lastVisitAt) : null
  const avgDays = visitStats[0]?.avgDaysBetweenVisits
    ? Number(visitStats[0].avgDaysBetweenVisits)
    : null

  const segment = computeClientSegment(
    {
      createdAt: client.createdAt,
      totalVisits: client.totalVisits,
      lastVisitAt,
      avgDaysBetweenVisits: avgDays,
    },
    thresholds,
  )

  return {
    client: {
      id: client.id,
      name: client.name,
      lastName: client.lastName,
      dni: client.dni,
      phone: client.phone,
      email: client.email,
      qrCode: client.qrCode,
      status: client.status,
      totalVisits: client.totalVisits,
      currentCycle: client.currentCycle,
      tier: client.tier,
      createdAt: client.createdAt,
    },
    segment,
    stamps: {
      current: stampsInCycle,
      max: stampsMax,
    },
    pendingRewards: pendingCount[0]?.cnt ?? 0,
    promotion: promotion
      ? {
          id: promotion.id,
          type: promotion.type,
          maxVisits: promotion.maxVisits ?? 0,
          rewardValue: promotion.rewardValue,
        }
      : null,
    tierInfo: currentTier
      ? {
          current: currentTier.name,
          nextTier: nextTierInfo?.name ?? null,
          visitsToNext: nextTierInfo?.visitsNeeded ?? null,
        }
      : undefined,
    rewardExpiration: {
      nearestExpiresAt: nearestExpiration[0]?.expiresAt ?? null,
      expiredCount: expiredCount[0]?.cnt ?? 0,
    },
    points: pointsData,
  }
}
