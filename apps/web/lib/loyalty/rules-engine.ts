import type {
  BonusWindow,
  LocalClock,
  PointsPromotionConfig,
  StampsPromotionConfig,
} from "@cuik/shared/validators"
import { activeBonusWindow, pointsForAmount } from "@cuik/shared/validators"

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

  // 4. Stamps to earn: every bonus that applies to this visit is a candidate
  //    (bonus window up to x3, legacy double-stamps day x2, birthday bonus),
  //    read in the tenant's local time. Only the highest one applies: bonuses
  //    never multiply each other (birthday x2 + hora especial x3 = x3).
  const clock = localClockAt(context.visitDate, context.timezone)
  const visitHour = Math.floor(clock.minutes / 60)
  const legacyDouble = config.accumulation.doubleStampsDays.some(
    (dsd) =>
      dsd.dayOfWeek === clock.weekday && visitHour >= dsd.startHour && visitHour <= dsd.endHour,
  )
  const stampsWindow = activeBonusWindow(config.accumulation.bonusWindows, clock)
  const best = highestBonus([
    isBirthdayVisit(context) && {
      multiplier: config.accumulation.birthdayBonus,
      reason: "birthday_bonus",
    },
    stampsWindow && {
      multiplier: stampsWindow.multiplier,
      reason: bonusWindowReason(stampsWindow),
    },
    legacyDouble && { multiplier: 2, reason: "double_stamps_day" },
  ])

  return {
    eligible: true,
    stampsToEarn: best?.multiplier ?? 1,
    bonusReasons: best ? [best.reason] : [],
  }
}

type Bonus = { multiplier: number; reason: string }

/** The bonus with the highest multiplier above x1; on a tie the first listed wins (birthday is listed first, so a tie credits the birthday). */
function highestBonus(candidates: (Bonus | false | null | undefined)[]): Bonus | null {
  let best: Bonus | null = null
  for (const c of candidates) {
    if (c && c.multiplier > 1 && (!best || c.multiplier > best.multiplier)) best = c
  }
  return best
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

  // 5. Calculate base points from amount (multiply or divide per calcMode,
  //    snapped to 6 decimals before rounding; see pointsForAmount).
  let pointsToEarn = pointsForAmount(context.visitAmount, config.points)

  const bonusReasons: string[] = []
  const basePoints = pointsToEarn

  // 6. Multiplier in the tenant's local time: bonus window, legacy day/hour
  //    multiplier (first match) or birthday multiplier. Only the highest one
  //    applies; they never multiply each other.
  const clock = localClockAt(context.visitDate, context.timezone)
  const visitHour = Math.floor(clock.minutes / 60)
  const legacy = config.accumulation.pointsMultipliers.find(
    (pm) => pm.dayOfWeek === clock.weekday && visitHour >= pm.startHour && visitHour <= pm.endHour,
  )
  const pointsWindow = activeBonusWindow(config.accumulation.bonusWindows, clock)
  const best = highestBonus([
    isBirthdayVisit(context) && {
      multiplier: config.accumulation.birthdayMultiplier,
      reason: "birthday_multiplier",
    },
    pointsWindow && {
      multiplier: pointsWindow.multiplier,
      reason: bonusWindowReason(pointsWindow),
    },
    legacy && { multiplier: legacy.multiplier, reason: `${legacy.multiplier}x_multiplier` },
  ])
  if (best) {
    pointsToEarn = Math.floor(pointsToEarn * best.multiplier)
    bonusReasons.push(best.reason)
  }

  return { eligible: true, pointsToEarn, basePoints, bonusReasons }
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

// --- Local time helpers ---

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/**
 * Date, weekday and minutes since midnight of `date` in `timeZone`. Without
 * a timezone (or with an invalid one) it falls back to the server clock.
 */
export function localClockAt(date: Date, timeZone?: string): LocalClock {
  if (timeZone) {
    try {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(date)
          .map((p) => [p.type, p.value]),
      )
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        weekday: WEEKDAYS[parts.weekday] ?? date.getDay(),
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
      }
    } catch {
      // Unknown timezone: use the server clock below.
    }
  }
  const p = (n: number) => String(n).padStart(2, "0")
  return {
    date: `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`,
    weekday: date.getDay(),
    minutes: date.getHours() * 60 + date.getMinutes(),
  }
}

/** Reason shown to the cashier: "Lunes de mañana (×2)" or "Hora ×3". */
function bonusWindowReason(w: BonusWindow): string {
  return w.label ? `${w.label} (×${w.multiplier})` : `Hora ×${w.multiplier}`
}

// --- Birthday helpers ---

type MonthDay = { month: number; day: number }

function monthDayOf(value: Date | string): MonthDay | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : { month: value.getMonth() + 1, day: value.getDate() }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  return { month: Number(m[2]), day: Number(m[3]) }
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * Is this visit happening on the client's birthday? Works with the birthday as
 * a Date or as the "YYYY-MM-DD" string Postgres returns for `date` columns,
 * and prefers the tenant-local visit date over the server clock. People born
 * on Feb 29 count on Feb 28 in non-leap years so they are never skipped.
 */
export function isBirthdayVisit(context: {
  visitDate: Date
  visitDateLocal?: string
  clientBirthday?: Date | string | null
}): boolean {
  if (context.clientBirthday == null) return false
  const birthday = monthDayOf(context.clientBirthday)
  if (!birthday) return false

  let visit: MonthDay | null
  let visitYear: number
  if (context.visitDateLocal) {
    visit = monthDayOf(context.visitDateLocal)
    visitYear = Number(context.visitDateLocal.slice(0, 4))
  } else {
    visit = { month: context.visitDate.getMonth() + 1, day: context.visitDate.getDate() }
    visitYear = context.visitDate.getFullYear()
  }
  if (!visit) return false

  if (visit.month === birthday.month && visit.day === birthday.day) return true
  return (
    birthday.month === 2 &&
    birthday.day === 29 &&
    visit.month === 2 &&
    visit.day === 28 &&
    !isLeapYear(visitYear)
  )
}
