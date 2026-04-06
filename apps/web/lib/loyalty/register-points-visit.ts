import { clients, type db as dbType, eq, pointsTransactions, visits } from "@cuik/db"
import type { PointsPromotionConfig } from "@cuik/shared/validators"

import { computeTier, evaluatePointsRules } from "./rules-engine"
import type { PointsRulesContext, PointsVisitResult, VisitResultCode } from "./types"

type PointsVisitParams = {
  client: {
    id: string
    name: string
    lastName: string | null
    totalVisits: number
    pointsBalance: number
    tier: string | null
    birthday?: Date | null
  }
  promotion: {
    id: string
    type: string
    config: unknown
  }
  config: PointsPromotionConfig
  tenantId: string
  cashierId: string
  locationId?: string | null
  amount: string
  todayVisitCount: number
  tx: Parameters<Parameters<typeof dbType.transaction>[0]>[0]
}

export async function registerPointsVisit(params: PointsVisitParams): Promise<PointsVisitResult> {
  const { client, config, tenantId, cashierId, locationId, amount, todayVisitCount, tx } = params

  // 1. Parse amount to number, validate > 0
  const numericAmount = Number(amount)
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return {
      code: "AMOUNT_REQUIRED" as VisitResultCode,
      client: {
        id: client.id,
        name: client.name,
        lastName: client.lastName,
        totalVisits: client.totalVisits,
        pointsBalance: client.pointsBalance,
        tier: client.tier,
      },
      points: { earned: 0, balance: client.pointsBalance },
    }
  }

  // 2. Build context and evaluate rules
  const rulesContext: PointsRulesContext = {
    visitDate: new Date(),
    clientTotalVisits: client.totalVisits,
    clientBirthday: client.birthday ?? null,
    visitAmount: numericAmount,
    locationId: locationId || null,
    todayVisitCount,
  }
  const rulesResult = evaluatePointsRules(config, rulesContext)

  // 3. If not eligible, return rejection with client info
  if (!rulesResult.eligible) {
    const responseCode: VisitResultCode =
      rulesResult.rejectionReason === "MAX_VISITS_REACHED" && config.points.maxVisitsPerDay === 1
        ? "ALREADY_SCANNED_TODAY"
        : (rulesResult.rejectionReason as VisitResultCode)

    return {
      code: responseCode,
      client: {
        id: client.id,
        name: client.name,
        lastName: client.lastName,
        totalVisits: client.totalVisits,
        pointsBalance: client.pointsBalance,
        tier: client.tier,
      },
      points: { earned: 0, balance: client.pointsBalance },
    }
  }

  // 4. Insert visit record (points promotions don't have cycles — always cycleNumber 1)
  const pointsToEarn = rulesResult.pointsToEarn
  const newTotalVisits = client.totalVisits + 1
  const visitNum = newTotalVisits

  const [visit] = await tx
    .insert(visits)
    .values({
      clientId: client.id,
      tenantId,
      visitNum,
      cycleNumber: 1,
      points: pointsToEarn,
      source: "qr",
      registeredBy: cashierId,
      locationId: locationId || null,
      amount,
    })
    .returning()

  // 5. Insert points_transaction (earn)
  await tx.insert(pointsTransactions).values({
    clientId: client.id,
    tenantId,
    amount: pointsToEarn,
    type: "earn",
    visitId: visit.id,
    description: `Earned ${pointsToEarn} points from visit`,
  })

  // 6. Update client: pointsBalance, totalVisits, tier
  const newPointsBalance = client.pointsBalance + pointsToEarn
  const tierResult = computeTier(config, newTotalVisits)
  const newTier = tierResult?.name ?? null

  await tx
    .update(clients)
    .set({
      pointsBalance: newPointsBalance,
      totalVisits: newTotalVisits,
      tier: newTier,
    })
    .where(eq(clients.id, client.id))

  // 7. Return success result
  return {
    code: "OK" as const,
    visit: {
      id: visit.id,
      pointsEarned: pointsToEarn,
      createdAt: visit.createdAt,
    },
    client: {
      id: client.id,
      name: client.name,
      lastName: client.lastName,
      totalVisits: newTotalVisits,
      pointsBalance: newPointsBalance,
      tier: newTier,
    },
    points: {
      earned: pointsToEarn,
      balance: newPointsBalance,
    },
    bonusApplied: rulesResult.bonusReasons.length > 0 ? rulesResult.bonusReasons.join(", ") : null,
  }
}
