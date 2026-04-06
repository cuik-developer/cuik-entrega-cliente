import type { PointsPromotionConfig, StampsPromotionConfig } from "@cuik/shared/validators"

import type {
  PointsRulesContext,
  PointsRulesResult,
  RulesEvaluationContext,
  RulesEvaluationResult,
  TierInfo,
} from "./types"

/** Any config that has a tiers block (both stamps and points share this shape) */
type TieredConfig = Pick<StampsPromotionConfig, "tiers">

/**
 * Evaluate stamp rules against the current visit context.
 * Pure function — no DB access, no side effects.
 */
export function evaluateStampRules(
  config: StampsPromotionConfig,
  context: RulesEvaluationContext,
): RulesEvaluationResult {
  // 1. Check max visits per day
  if (context.todayVisitCount >= config.stamps.maxVisitsPerDay) {
    return {
      eligible: false,
      stampsToEarn: 0,
      bonusReasons: [],
      rejectionReason: "MAX_VISITS_REACHED",
    }
  }

  // 2. Check location restrictions
  if (
    config.locationRestrictions.restrictToLocations &&
    context.locationId &&
    !config.locationRestrictions.allowedLocationIds.includes(context.locationId)
  ) {
    return {
      eligible: false,
      stampsToEarn: 0,
      bonusReasons: [],
      rejectionReason: "LOCATION_NOT_ALLOWED",
    }
  }

  // 3. Check minimum purchase amount
  if (config.accumulation.minimumPurchaseAmount !== null) {
    if (context.visitAmount == null) {
      return {
        eligible: false,
        stampsToEarn: 0,
        bonusReasons: [],
        rejectionReason: "AMOUNT_REQUIRED",
      }
    }
    if (context.visitAmount < config.accumulation.minimumPurchaseAmount) {
      return {
        eligible: false,
        stampsToEarn: 0,
        bonusReasons: [],
        rejectionReason: "BELOW_MINIMUM_PURCHASE",
      }
    }
  }

  // 4. Calculate stamps to earn
  let stampsToEarn = 1
  const bonusReasons: string[] = []

  // 4a. Check double stamps days
  if (config.accumulation.doubleStampsDays.length > 0) {
    const visitDay = context.visitDate.getDay()
    const visitHour = context.visitDate.getHours()

    for (const dsd of config.accumulation.doubleStampsDays) {
      if (dsd.dayOfWeek === visitDay && visitHour >= dsd.startHour && visitHour <= dsd.endHour) {
        stampsToEarn *= 2
        bonusReasons.push("double_stamps_day")
        break
      }
    }
  }

  // 4b. Check birthday bonus
  if (config.accumulation.birthdayBonus > 0 && context.clientBirthday != null) {
    const visitMonth = context.visitDate.getMonth()
    const visitDayOfMonth = context.visitDate.getDate()
    const birthdayMonth = context.clientBirthday.getMonth()
    const birthdayDay = context.clientBirthday.getDate()

    if (visitMonth === birthdayMonth && visitDayOfMonth === birthdayDay) {
      stampsToEarn *= config.accumulation.birthdayBonus
      bonusReasons.push("birthday_bonus")
    }
  }

  return { eligible: true, stampsToEarn, bonusReasons }
}

/**
 * Evaluate points rules against the current visit context.
 * Pure function — no DB access, no side effects.
 */
export function evaluatePointsRules(
  config: PointsPromotionConfig,
  context: PointsRulesContext,
): PointsRulesResult {
  // 1. Check max visits per day
  if (context.todayVisitCount >= config.points.maxVisitsPerDay) {
    return {
      eligible: false,
      pointsToEarn: 0,
      bonusReasons: [],
      rejectionReason: "MAX_VISITS_REACHED",
    }
  }

  // 2. Check location restrictions
  if (
    config.locationRestrictions.restrictToLocations &&
    context.locationId &&
    !config.locationRestrictions.allowedLocationIds.includes(context.locationId)
  ) {
    return {
      eligible: false,
      pointsToEarn: 0,
      bonusReasons: [],
      rejectionReason: "LOCATION_NOT_ALLOWED",
    }
  }

  // 3. Validate amount is provided and > 0
  if (context.visitAmount == null || context.visitAmount <= 0) {
    return {
      eligible: false,
      pointsToEarn: 0,
      bonusReasons: [],
      rejectionReason: context.visitAmount == null ? "AMOUNT_REQUIRED" : "BELOW_MINIMUM_PURCHASE",
    }
  }

  // 4. Check minimum purchase for points
  if (
    config.points.minimumPurchaseForPoints !== null &&
    context.visitAmount < config.points.minimumPurchaseForPoints
  ) {
    return {
      eligible: false,
      pointsToEarn: 0,
      bonusReasons: [],
      rejectionReason: "BELOW_MINIMUM_PURCHASE",
    }
  }

  // 5. Calculate base points from amount
  const rawPoints = context.visitAmount * config.points.pointsPerCurrency
  let pointsToEarn: number

  switch (config.points.roundingMethod) {
    case "ceil":
      pointsToEarn = Math.ceil(rawPoints)
      break
    case "round":
      pointsToEarn = Math.round(rawPoints)
      break
    default:
      pointsToEarn = Math.floor(rawPoints)
      break
  }

  const bonusReasons: string[] = []

  // 6. Apply day/hour multipliers (first match wins, no stacking)
  if (config.accumulation.pointsMultipliers.length > 0) {
    const visitDay = context.visitDate.getDay()
    const visitHour = context.visitDate.getHours()

    for (const pm of config.accumulation.pointsMultipliers) {
      if (pm.dayOfWeek === visitDay && visitHour >= pm.startHour && visitHour <= pm.endHour) {
        pointsToEarn = Math.floor(pointsToEarn * pm.multiplier)
        bonusReasons.push(`${pm.multiplier}x_multiplier`)
        break
      }
    }
  }

  // 7. Apply birthday multiplier (stacks multiplicatively with day multiplier)
  if (config.accumulation.birthdayMultiplier > 1 && context.clientBirthday != null) {
    const visitMonth = context.visitDate.getMonth()
    const visitDayOfMonth = context.visitDate.getDate()
    const birthdayMonth = context.clientBirthday.getMonth()
    const birthdayDay = context.clientBirthday.getDate()

    if (visitMonth === birthdayMonth && visitDayOfMonth === birthdayDay) {
      pointsToEarn = Math.floor(pointsToEarn * config.accumulation.birthdayMultiplier)
      bonusReasons.push("birthday_multiplier")
    }
  }

  return { eligible: true, pointsToEarn, bonusReasons }
}

/**
 * Compute the current tier for a client based on total visits.
 * Returns null if tiers are disabled or no levels configured.
 */
export function computeTier(config: TieredConfig, totalVisits: number): TierInfo | null {
  if (!config.tiers.enabled || config.tiers.levels.length === 0) {
    return null
  }

  // Sort levels by minVisits descending to find highest matching tier
  const sorted = [...config.tiers.levels].sort((a, b) => b.minVisits - a.minVisits)

  for (const level of sorted) {
    if (
      totalVisits >= level.minVisits &&
      (level.maxVisits === null || totalVisits <= level.maxVisits)
    ) {
      return {
        name: level.name,
        minVisits: level.minVisits,
        maxVisits: level.maxVisits,
      }
    }
  }

  return null
}

/**
 * Get the next tier above the current one based on total visits.
 * Returns null if already at top tier or tiers are disabled.
 */
export function getNextTier(
  config: TieredConfig,
  totalVisits: number,
): { name: string; visitsNeeded: number } | null {
  if (!config.tiers.enabled || config.tiers.levels.length === 0) {
    return null
  }

  const currentTier = computeTier(config, totalVisits)

  // Sort levels by minVisits ascending
  const sorted = [...config.tiers.levels].sort((a, b) => a.minVisits - b.minVisits)

  if (!currentTier) {
    // Not in any tier yet — next tier is the lowest one
    const lowest = sorted[0]
    if (lowest && totalVisits < lowest.minVisits) {
      return {
        name: lowest.name,
        visitsNeeded: lowest.minVisits - totalVisits,
      }
    }
    return null
  }

  // Find the tier after the current one
  const currentIndex = sorted.findIndex(
    (l) => l.name === currentTier.name && l.minVisits === currentTier.minVisits,
  )

  if (currentIndex === -1 || currentIndex >= sorted.length - 1) {
    return null // Already at top tier
  }

  const next = sorted[currentIndex + 1]
  return {
    name: next.name,
    visitsNeeded: next.minVisits - totalVisits,
  }
}
