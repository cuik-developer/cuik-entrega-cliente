import {
  and,
  clients,
  count,
  db,
  eq,
  promotions,
  rewards,
  sql,
  tenants,
  visits,
} from "@cuik/db"
import { pointsPromotionConfigSchema, stampsPromotionConfigSchema } from "@cuik/shared/validators"

import { updateRewardsRedeemed, updateVisitsDaily } from "../analytics/update-visits-daily"
import { registerPointsVisit } from "./register-points-visit"
import { computeTier, evaluateStampRules } from "./rules-engine"
import type {
  PointsVisitResult,
  RulesEvaluationContext,
  VisitResult,
  VisitResultCode,
} from "./types"

export async function registerVisit(params: {
  qrCode: string
  tenantId: string
  cashierId: string
  locationId?: string
  amount?: string
}): Promise<VisitResult | PointsVisitResult> {
  const { qrCode, tenantId, cashierId, locationId, amount } = params

  // Track analytics context outside the transaction (separate vars for TS closure narrowing)
  let analyticsLocationId: string | null = null
  let analyticsIsNewClient = false
  let analyticsCycleComplete = false

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transaction with stamps/points dual logic, cycle management, and analytics
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
      return {
        code: "CLIENT_NOT_FOUND" as const,
        client: { id: "", name: "", lastName: null, totalVisits: 0, currentCycle: 1, tier: null },
        stamps: { current: 0, max: 0 },
        cycleComplete: false,
        pendingRewards: 0,
      }
    }

    // 1b. Read tenant timezone for "today" comparisons (used below)
    const tenantRows = await tx
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    const tenantTz = tenantRows[0]?.timezone ?? "America/Lima"

    // 2. Find active promotion (stamps or points)
    const promoRows = await tx
      .select()
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
      .limit(1)

    const promotion = promoRows[0]
    if (!promotion) {
      return {
        code: "NO_ACTIVE_PROMOTION" as const,
        client: {
          id: client.id,
          name: client.name,
          lastName: client.lastName,
          totalVisits: client.totalVisits,
          currentCycle: client.currentCycle,
          tier: client.tier ?? null,
        },
        stamps: { current: 0, max: 0 },
        cycleComplete: false,
        pendingRewards: 0,
      }
    }

    // --- Points dispatch: delegate to registerPointsVisit ---
    if (promotion.type === "points") {
      const pointsConfig = pointsPromotionConfigSchema.parse(promotion.config ?? {})

      // Count today's visits for the points flow (uses tenant timezone, not UTC)
      const todayVisitsPts = await tx
        .select({ cnt: count() })
        .from(visits)
        .where(
          and(
            eq(visits.clientId, client.id),
            eq(visits.tenantId, tenantId),
            sql`${visits.source} IS DISTINCT FROM 'bonus'`,
            sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tenantTz})::date = (NOW() AT TIME ZONE ${tenantTz})::date`,
          ),
        )

      const todayVisitCountPts = todayVisitsPts[0]?.cnt ?? 0

      if (!amount) {
        return {
          code: "AMOUNT_REQUIRED" as VisitResultCode,
          client: {
            id: client.id,
            name: client.name,
            lastName: client.lastName,
            totalVisits: client.totalVisits,
            pointsBalance: client.pointsBalance,
            tier: client.tier ?? null,
          },
          points: { earned: 0, balance: client.pointsBalance },
        } satisfies PointsVisitResult
      }

      return registerPointsVisit({
        client: {
          id: client.id,
          name: client.name,
          lastName: client.lastName,
          totalVisits: client.totalVisits,
          pointsBalance: client.pointsBalance,
          tier: client.tier ?? null,
        },
        promotion,
        config: pointsConfig,
        tenantId,
        cashierId,
        locationId: locationId || null,
        amount,
        todayVisitCount: todayVisitCountPts,
        tx,
      })
    }

    // --- Stamps flow (existing logic, unchanged below) ---
    if (!promotion.maxVisits) {
      return {
        code: "NO_ACTIVE_PROMOTION" as const,
        client: {
          id: client.id,
          name: client.name,
          lastName: client.lastName,
          totalVisits: client.totalVisits,
          currentCycle: client.currentCycle,
          tier: client.tier ?? null,
        },
        stamps: { current: 0, max: 0 },
        cycleComplete: false,
        pendingRewards: 0,
      }
    }

    // Parse promotion config with defaults
    const config = stampsPromotionConfigSchema.parse(promotion.config ?? {})

    // 3. Count today's visits (uses tenant timezone, not UTC)
    const todayVisits = await tx
      .select({ cnt: count() })
      .from(visits)
      .where(
        and(
          eq(visits.clientId, client.id),
          eq(visits.tenantId, tenantId),
          sql`${visits.source} IS DISTINCT FROM 'bonus'`,
          sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tenantTz})::date = (NOW() AT TIME ZONE ${tenantTz})::date`,
        ),
      )

    const todayVisitCount = todayVisits[0]?.cnt ?? 0

    // 4. Evaluate stamp rules (max visits/day, location, min purchase, bonuses)
    const rulesContext: RulesEvaluationContext = {
      visitDate: new Date(),
      clientTotalVisits: client.totalVisits,
      clientBirthday: null, // Phase 1: no birthday column yet
      visitAmount: amount ? Number(amount) : null,
      locationId: locationId || null,
      todayVisitCount,
    }
    const rulesResult = evaluateStampRules(config, rulesContext)

    if (!rulesResult.eligible) {
      // Return client info for UI display even on rejection
      const stampsInCycle = client.totalVisits % promotion.maxVisits
      const tierResult = computeTier(config, client.totalVisits)

      const pendingCount = await tx
        .select({ cnt: count() })
        .from(rewards)
        .where(
          and(
            eq(rewards.clientId, client.id),
            eq(rewards.tenantId, tenantId),
            eq(rewards.status, "pending"),
          ),
        )

      // Map rejection reason — keep ALREADY_SCANNED_TODAY for backward compat when maxVisitsPerDay=1
      const responseCode: VisitResultCode =
        rulesResult.rejectionReason === "MAX_VISITS_REACHED" && config.stamps.maxVisitsPerDay === 1
          ? "ALREADY_SCANNED_TODAY"
          : (rulesResult.rejectionReason as VisitResultCode)

      return {
        code: responseCode,
        client: {
          id: client.id,
          name: client.name,
          lastName: client.lastName,
          totalVisits: client.totalVisits,
          currentCycle: client.currentCycle,
          tier: tierResult?.name ?? client.tier ?? null,
        },
        stamps: { current: stampsInCycle, max: promotion.maxVisits },
        cycleComplete: false,
        pendingRewards: pendingCount[0]?.cnt ?? 0,
        rewardValue: promotion.rewardValue,
      }
    }

    // 5. Calculate cycle position with stampsToEarn from rules engine
    const stampsToEarn = rulesResult.stampsToEarn
    const newTotalVisits = client.totalVisits + stampsToEarn

    // Handle stamp accumulation — stampsToEarn may complete a cycle or even span multiple
    const _stampsInCycleBefore = client.totalVisits % promotion.maxVisits
    const stampsInCycleAfter = newTotalVisits % promotion.maxVisits
    const cyclesBefore = Math.floor(client.totalVisits / promotion.maxVisits)
    const cyclesAfter = Math.floor(newTotalVisits / promotion.maxVisits)
    const cyclesCompleted = cyclesAfter - cyclesBefore
    const cycleComplete = cyclesCompleted > 0

    // visitNum = position within current cycle (1-based)
    const visitNum = stampsInCycleAfter === 0 ? promotion.maxVisits : stampsInCycleAfter
    // cycleNumber = which cycle this visit belongs to
    const cycleNumber = cycleComplete
      ? cyclesAfter // last completed cycle
      : cyclesAfter + 1

    // 6. Insert visit
    const [visit] = await tx
      .insert(visits)
      .values({
        clientId: client.id,
        tenantId,
        visitNum,
        cycleNumber,
        source: "qr",
        registeredBy: cashierId,
        locationId: locationId || null,
        amount: amount || null,
      })
      .returning()

    // 7. Compute tier after earning stamps
    const tierResult = computeTier(config, newTotalVisits)
    const newTier = tierResult?.name ?? null

    // 8. Update client with new totals and tier
    const newCycle = cycleComplete ? cyclesAfter + 1 : cycleNumber
    await tx
      .update(clients)
      .set({
        totalVisits: newTotalVisits,
        currentCycle: newCycle,
        tier: newTier,
      })
      .where(eq(clients.id, client.id))

    // 9. Create pending rewards for each completed cycle
    if (cycleComplete) {
      for (let i = 0; i < cyclesCompleted; i++) {
        const rewardCycleNumber = cyclesBefore + i + 1
        const expiresAt = config.stamps.rewardExpirationDays
          ? new Date(Date.now() + config.stamps.rewardExpirationDays * 24 * 60 * 60 * 1000)
          : null

        await tx.insert(rewards).values({
          clientId: client.id,
          tenantId,
          cycleNumber: rewardCycleNumber,
          rewardType: promotion.rewardValue,
          status: "pending",
          expiresAt,
        })
      }
    }

    // 10. Count pending rewards
    const pendingCount = await tx
      .select({ cnt: count() })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, client.id),
          eq(rewards.tenantId, tenantId),
          eq(rewards.status, "pending"),
        ),
      )

    // Set analytics context for fire-and-forget after commit
    if (locationId) {
      analyticsLocationId = locationId
      analyticsIsNewClient = client.totalVisits === 0
      analyticsCycleComplete = cycleComplete
    }

    return {
      code: "OK" as const,
      visit: {
        id: visit.id,
        visitNum,
        cycleNumber,
        createdAt: visit.createdAt,
      },
      client: {
        id: client.id,
        name: client.name,
        lastName: client.lastName,
        totalVisits: newTotalVisits,
        currentCycle: newCycle,
        tier: newTier,
      },
      stamps: {
        current: cycleComplete && stampsInCycleAfter === 0 ? 0 : stampsInCycleAfter,
        max: promotion.maxVisits,
      },
      cycleComplete,
      pendingRewards: pendingCount[0]?.cnt ?? 0,
      rewardValue: promotion.rewardValue,
      bonusApplied:
        rulesResult.bonusReasons.length > 0 ? rulesResult.bonusReasons.join(", ") : null,
    }
  })

  // Fire-and-forget: update analytics after transaction commits successfully
  if (result.code === "OK" && analyticsLocationId) {
    updateVisitsDaily(tenantId, analyticsLocationId, new Date(), {
      isNewClient: analyticsIsNewClient,
    }).catch((err) => console.error("[registerVisit] updateVisitsDaily failed:", err))

    if (analyticsCycleComplete) {
      updateRewardsRedeemed(tenantId, analyticsLocationId, new Date()).catch((err) =>
        console.error("[registerVisit] updateRewardsRedeemed failed:", err),
      )
    }
  }

  return result
}
