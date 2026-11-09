import {
  and,
  clients,
  count,
  db,
  desc,
  eq,
  gt,
  promotions,
  rewardCatalog,
  rewards,
  sql,
  visits,
} from "@cuik/db"
import {
  cashbackSettingsOf,
  type PointsPromotionConfig,
  pointsPromotionConfigSchema,
  type StampsPromotionConfig,
  stampsPromotionConfigSchema,
} from "@cuik/shared/validators"
import { clientCashback } from "./cashback-db"
import type { SegmentationThresholds } from "./client-segments"
import { computeClientSegment } from "./client-segments"
import { activeMilestones, cashOutOfferFor } from "./milestones"
import { nextExpiration } from "./points-lots"
import { computeTier, getNextTier } from "./rules-engine"
import { stampsInCycleOf } from "./stamps"
import type { ClientStatus } from "./types"
import { withinVoidWindow } from "./void-redemption"

/** Intermediate gift ("escalera") waiting exactly one visit ahead, for the cashier screens. */
/**
 * The client's last stamps redemption while it can still be undone (inside the
 * window and with no visit since), so Buscar can offer "Anular canje".
 */
async function voidableRedemption(
  clientId: string,
  tenantId: string,
): Promise<ClientStatus["lastRedemption"]> {
  const [last] = await db
    .select({
      id: rewards.id,
      kind: rewards.kind,
      label: rewards.rewardType,
      redeemedAt: rewards.redeemedAt,
      redeemedBy: rewards.redeemedBy,
      voidedAt: rewards.voidedAt,
    })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, clientId),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "redeemed"),
      ),
    )
    .orderBy(desc(rewards.redeemedAt))
    .limit(1)
  // Same conditions as voidRedemption: a till redemption, not undone before, in the window.
  if (!last?.redeemedAt || !last.redeemedBy || last.voidedAt) return null
  if (!withinVoidWindow(last.redeemedAt)) return null
  const [later] = await db
    .select({ id: visits.id })
    .from(visits)
    .where(and(eq(visits.clientId, clientId), gt(visits.createdAt, last.redeemedAt)))
    .limit(1)
  if (later) return null
  return {
    id: last.id,
    kind: last.kind === "milestone" ? "milestone" : "final",
    label: last.label,
    redeemedAt: last.redeemedAt,
  }
}

/** Cashback reward: the card's accumulated amount and the rewards waiting at the till; null for a gift or points. */
async function cashbackOf(
  config: StampsPromotionConfig | PointsPromotionConfig | null,
  client: { id: string; cashbackBalance: string | number | null },
  tenantId: string,
) {
  if (!config || !("stamps" in config)) return null
  return clientCashback(client, tenantId, cashbackSettingsOf(config.stamps))
}

function nextGiftFor(
  isPoints: boolean,
  config: StampsPromotionConfig | PointsPromotionConfig | null,
  maxVisits: number | null,
  stampsInCycle: number | null,
): { at: number; label: string } | null {
  if (isPoints || !config || !("stamps" in config) || !maxVisits || stampsInCycle === null)
    return null
  // The early cash-out is optional and recorded at the till: never shown as "next gift".
  const hit = activeMilestones(config.stamps, maxVisits).find(
    (m) => !m.redeemable && m.at === stampsInCycle + 1,
  )
  return hit ? { at: hit.at, label: hit.label } : null
}

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

  // 2. Get active promotion. A tenant can have a stamps and a points promotion
  // active at once (the default stamps one + a points one): prefer points, the
  // same choice register-client makes, so the card and the till agree.
  const promoRows = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .orderBy(sql`CASE WHEN ${promotions.type} = 'points' THEN 0 ELSE 1 END`, promotions.createdAt)
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
    !isPoints && promotion?.maxVisits ? stampsInCycleOf(client, promotion.maxVisits) : null
  const stampsMax = !isPoints ? (promotion?.maxVisits ?? null) : null
  const nextMilestone = nextGiftFor(isPoints, config, promotion?.maxVisits ?? null, stampsInCycle)
  const cashOut =
    config && "stamps" in config && promotion?.maxVisits && stampsInCycle !== null
      ? cashOutOfferFor(config.stamps, promotion.maxVisits, stampsInCycle)
      : null
  const lastRedemption = isPoints ? null : await voidableRedemption(client.id, tenantId)
  const cashback = await cashbackOf(config, client, tenantId)

  // 9. For points promotions, count available catalog items
  let pointsData: ClientStatus["points"]
  if (isPoints) {
    const [availableItems, upcoming] = await Promise.all([
      db
        .select({ cnt: count() })
        .from(rewardCatalog)
        .where(
          and(
            eq(rewardCatalog.tenantId, tenantId),
            eq(rewardCatalog.active, true),
            sql`${rewardCatalog.pointsCost} <= ${client.pointsBalance}`,
          ),
        ),
      nextExpiration(db, client.id),
    ])

    pointsData = {
      balance: client.pointsBalance,
      availableCatalogItems: availableItems[0]?.cnt ?? 0,
      nextExpiration: upcoming,
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
      birthday: client.birthday,
      createdAt: client.createdAt,
      archivedAt: client.archivedAt,
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
    nextMilestone,
    cashOut,
    cashback,
    lastRedemption,
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
