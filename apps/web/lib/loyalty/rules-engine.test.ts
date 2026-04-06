import type { StampsPromotionConfig } from "@cuik/shared/validators"

import { DEFAULT_STAMPS_CONFIG } from "@cuik/shared/validators"
import { describe, expect, it } from "vitest"
import { computeTier, evaluateStampRules, getNextTier } from "./rules-engine"
import type { RulesEvaluationContext } from "./types"

// --- Helpers ---

function makeConfig(overrides: Partial<StampsPromotionConfig> = {}): StampsPromotionConfig {
  return {
    ...DEFAULT_STAMPS_CONFIG,
    ...overrides,
    stamps: { ...DEFAULT_STAMPS_CONFIG.stamps, ...overrides.stamps },
    accumulation: {
      ...DEFAULT_STAMPS_CONFIG.accumulation,
      ...overrides.accumulation,
    },
    tiers: { ...DEFAULT_STAMPS_CONFIG.tiers, ...overrides.tiers },
    locationRestrictions: {
      ...DEFAULT_STAMPS_CONFIG.locationRestrictions,
      ...overrides.locationRestrictions,
    },
  }
}

function makeContext(overrides: Partial<RulesEvaluationContext> = {}): RulesEvaluationContext {
  return {
    visitDate: new Date("2026-03-15T14:00:00"),
    clientTotalVisits: 5,
    clientBirthday: null,
    visitAmount: null,
    locationId: null,
    todayVisitCount: 0,
    ...overrides,
  }
}

// --- evaluateStampRules ---

describe("evaluateStampRules", () => {
  describe("max visits per day", () => {
    it("allows visit when todayVisitCount is 0 (default maxVisitsPerDay=1)", () => {
      const result = evaluateStampRules(DEFAULT_STAMPS_CONFIG, makeContext({ todayVisitCount: 0 }))
      expect(result.eligible).toBe(true)
      expect(result.stampsToEarn).toBe(1)
    })

    it("rejects when todayVisitCount >= maxVisitsPerDay (default=1)", () => {
      const result = evaluateStampRules(DEFAULT_STAMPS_CONFIG, makeContext({ todayVisitCount: 1 }))
      expect(result.eligible).toBe(false)
      expect(result.stampsToEarn).toBe(0)
      expect(result.rejectionReason).toBe("MAX_VISITS_REACHED")
    })

    it("allows 2 visits when maxVisitsPerDay is 3", () => {
      const config = makeConfig({ stamps: { ...DEFAULT_STAMPS_CONFIG.stamps, maxVisitsPerDay: 3 } })
      const result = evaluateStampRules(config, makeContext({ todayVisitCount: 2 }))
      expect(result.eligible).toBe(true)
    })

    it("rejects 3rd visit when maxVisitsPerDay is 3", () => {
      const config = makeConfig({ stamps: { ...DEFAULT_STAMPS_CONFIG.stamps, maxVisitsPerDay: 3 } })
      const result = evaluateStampRules(config, makeContext({ todayVisitCount: 3 }))
      expect(result.eligible).toBe(false)
      expect(result.rejectionReason).toBe("MAX_VISITS_REACHED")
    })
  })

  describe("location restrictions", () => {
    const locConfig = makeConfig({
      locationRestrictions: {
        restrictToLocations: true,
        allowedLocationIds: ["loc-aaa", "loc-bbb"],
      },
    })

    it("allows visit at an allowed location", () => {
      const result = evaluateStampRules(locConfig, makeContext({ locationId: "loc-aaa" }))
      expect(result.eligible).toBe(true)
    })

    it("rejects visit at a non-allowed location", () => {
      const result = evaluateStampRules(locConfig, makeContext({ locationId: "loc-zzz" }))
      expect(result.eligible).toBe(false)
      expect(result.rejectionReason).toBe("LOCATION_NOT_ALLOWED")
    })

    it("allows visit when locationId is null (no location provided)", () => {
      const result = evaluateStampRules(locConfig, makeContext({ locationId: null }))
      expect(result.eligible).toBe(true)
    })

    it("allows any location when restrictToLocations is false", () => {
      const result = evaluateStampRules(
        DEFAULT_STAMPS_CONFIG,
        makeContext({ locationId: "loc-zzz" }),
      )
      expect(result.eligible).toBe(true)
    })
  })

  describe("minimum purchase amount", () => {
    const minPurchaseConfig = makeConfig({
      accumulation: {
        ...DEFAULT_STAMPS_CONFIG.accumulation,
        minimumPurchaseAmount: 10,
      },
    })

    it("allows visit when no minimum purchase is configured", () => {
      const result = evaluateStampRules(DEFAULT_STAMPS_CONFIG, makeContext({ visitAmount: null }))
      expect(result.eligible).toBe(true)
    })

    it("rejects when minimum is set but no amount provided", () => {
      const result = evaluateStampRules(minPurchaseConfig, makeContext({ visitAmount: null }))
      expect(result.eligible).toBe(false)
      expect(result.rejectionReason).toBe("AMOUNT_REQUIRED")
    })

    it("rejects when amount is below minimum", () => {
      const result = evaluateStampRules(minPurchaseConfig, makeContext({ visitAmount: 5 }))
      expect(result.eligible).toBe(false)
      expect(result.rejectionReason).toBe("BELOW_MINIMUM_PURCHASE")
    })

    it("allows when amount meets minimum", () => {
      const result = evaluateStampRules(minPurchaseConfig, makeContext({ visitAmount: 10 }))
      expect(result.eligible).toBe(true)
    })

    it("allows when amount exceeds minimum", () => {
      const result = evaluateStampRules(minPurchaseConfig, makeContext({ visitAmount: 50 }))
      expect(result.eligible).toBe(true)
    })
  })

  describe("double stamps days", () => {
    // 2026-03-15 is a Sunday (dayOfWeek = 0)
    const sundayAt14 = new Date("2026-03-15T14:00:00")
    // 2026-03-16 is a Monday (dayOfWeek = 1)
    const mondayAt10 = new Date("2026-03-16T10:00:00")

    const doubleConfig = makeConfig({
      accumulation: {
        ...DEFAULT_STAMPS_CONFIG.accumulation,
        doubleStampsDays: [
          { dayOfWeek: 0, startHour: 12, endHour: 18 }, // Sunday 12-18
        ],
      },
    })

    it("doubles stamps on matching day and hour", () => {
      const result = evaluateStampRules(doubleConfig, makeContext({ visitDate: sundayAt14 }))
      expect(result.eligible).toBe(true)
      expect(result.stampsToEarn).toBe(2)
      expect(result.bonusReasons).toContain("double_stamps_day")
    })

    it("does not double on non-matching day", () => {
      const result = evaluateStampRules(doubleConfig, makeContext({ visitDate: mondayAt10 }))
      expect(result.eligible).toBe(true)
      expect(result.stampsToEarn).toBe(1)
      expect(result.bonusReasons).not.toContain("double_stamps_day")
    })

    it("does not double when outside hour range", () => {
      const sundayAt8 = new Date("2026-03-15T08:00:00")
      const result = evaluateStampRules(doubleConfig, makeContext({ visitDate: sundayAt8 }))
      expect(result.stampsToEarn).toBe(1)
    })

    it("doubles at boundary start hour", () => {
      const sundayAt12 = new Date("2026-03-15T12:00:00")
      const result = evaluateStampRules(doubleConfig, makeContext({ visitDate: sundayAt12 }))
      expect(result.stampsToEarn).toBe(2)
    })

    it("doubles at boundary end hour", () => {
      const sundayAt18 = new Date("2026-03-15T18:00:00")
      const result = evaluateStampRules(doubleConfig, makeContext({ visitDate: sundayAt18 }))
      expect(result.stampsToEarn).toBe(2)
    })

    it("handles multiple double stamp windows (first match wins)", () => {
      const multiConfig = makeConfig({
        accumulation: {
          ...DEFAULT_STAMPS_CONFIG.accumulation,
          doubleStampsDays: [
            { dayOfWeek: 0, startHour: 10, endHour: 12 },
            { dayOfWeek: 0, startHour: 14, endHour: 20 },
          ],
        },
      })
      const result = evaluateStampRules(multiConfig, makeContext({ visitDate: sundayAt14 }))
      expect(result.stampsToEarn).toBe(2)
      expect(result.bonusReasons).toContain("double_stamps_day")
    })
  })

  describe("birthday bonus", () => {
    const birthdayConfig = makeConfig({
      accumulation: {
        ...DEFAULT_STAMPS_CONFIG.accumulation,
        birthdayBonus: 3,
      },
    })

    it("applies birthday bonus on matching month+day", () => {
      const result = evaluateStampRules(
        birthdayConfig,
        makeContext({
          visitDate: new Date("2026-03-15T14:00:00"),
          clientBirthday: new Date("1990-03-15T12:00:00"),
        }),
      )
      expect(result.stampsToEarn).toBe(3)
      expect(result.bonusReasons).toContain("birthday_bonus")
    })

    it("does not apply birthday bonus on non-matching day", () => {
      const result = evaluateStampRules(
        birthdayConfig,
        makeContext({
          visitDate: new Date("2026-03-15T14:00:00"),
          clientBirthday: new Date("1990-06-20T12:00:00"),
        }),
      )
      expect(result.stampsToEarn).toBe(1)
      expect(result.bonusReasons).not.toContain("birthday_bonus")
    })

    it("skips birthday check when clientBirthday is null", () => {
      const result = evaluateStampRules(birthdayConfig, makeContext({ clientBirthday: null }))
      expect(result.stampsToEarn).toBe(1)
    })

    it("does not apply birthday bonus when birthdayBonus is 0", () => {
      const result = evaluateStampRules(
        DEFAULT_STAMPS_CONFIG,
        makeContext({
          visitDate: new Date("2026-03-15T14:00:00"),
          clientBirthday: new Date("1990-03-15T12:00:00"),
        }),
      )
      expect(result.stampsToEarn).toBe(1)
    })
  })

  describe("combined rules", () => {
    it("applies double stamps AND birthday bonus (multiplicative)", () => {
      const config = makeConfig({
        accumulation: {
          ...DEFAULT_STAMPS_CONFIG.accumulation,
          doubleStampsDays: [
            { dayOfWeek: 0, startHour: 10, endHour: 18 }, // Sunday
          ],
          birthdayBonus: 3,
        },
      })
      const result = evaluateStampRules(
        config,
        makeContext({
          visitDate: new Date("2026-03-15T14:00:00"), // Sunday
          clientBirthday: new Date("1990-03-15T12:00:00"),
        }),
      )
      // 1 * 2 (double) * 3 (birthday) = 6
      expect(result.stampsToEarn).toBe(6)
      expect(result.bonusReasons).toContain("double_stamps_day")
      expect(result.bonusReasons).toContain("birthday_bonus")
    })

    it("checks max visits before other rules", () => {
      const config = makeConfig({
        accumulation: {
          ...DEFAULT_STAMPS_CONFIG.accumulation,
          doubleStampsDays: [{ dayOfWeek: 0, startHour: 10, endHour: 18 }],
        },
      })
      const result = evaluateStampRules(
        config,
        makeContext({ todayVisitCount: 1 }), // default max is 1
      )
      expect(result.eligible).toBe(false)
      expect(result.stampsToEarn).toBe(0)
    })
  })

  describe("default config produces standard behavior", () => {
    it("allows 1 visit per day earning 1 stamp", () => {
      const result = evaluateStampRules(DEFAULT_STAMPS_CONFIG, makeContext())
      expect(result.eligible).toBe(true)
      expect(result.stampsToEarn).toBe(1)
      expect(result.bonusReasons).toEqual([])
    })
  })
})

// --- computeTier ---

describe("computeTier", () => {
  const defaultConfig = DEFAULT_STAMPS_CONFIG

  it("returns 'Nuevo' for 0 visits", () => {
    const tier = computeTier(defaultConfig, 0)
    expect(tier).toEqual({ name: "Nuevo", minVisits: 0, maxVisits: 4 })
  })

  it("returns 'Nuevo' for 4 visits (boundary)", () => {
    const tier = computeTier(defaultConfig, 4)
    expect(tier).toEqual({ name: "Nuevo", minVisits: 0, maxVisits: 4 })
  })

  it("returns 'Frecuente' for 5 visits (boundary)", () => {
    const tier = computeTier(defaultConfig, 5)
    expect(tier).toEqual({ name: "Frecuente", minVisits: 5, maxVisits: 19 })
  })

  it("returns 'Frecuente' for 19 visits (boundary)", () => {
    const tier = computeTier(defaultConfig, 19)
    expect(tier).toEqual({ name: "Frecuente", minVisits: 5, maxVisits: 19 })
  })

  it("returns 'VIP' for 20 visits (boundary)", () => {
    const tier = computeTier(defaultConfig, 20)
    expect(tier).toEqual({ name: "VIP", minVisits: 20, maxVisits: null })
  })

  it("returns 'VIP' for 100 visits", () => {
    const tier = computeTier(defaultConfig, 100)
    expect(tier).toEqual({ name: "VIP", minVisits: 20, maxVisits: null })
  })

  it("returns null when tiers are disabled", () => {
    const config = makeConfig({ tiers: { enabled: false, levels: [] } })
    const tier = computeTier(config, 10)
    expect(tier).toBeNull()
  })

  it("returns null when levels array is empty", () => {
    const config = makeConfig({ tiers: { enabled: true, levels: [] } })
    const tier = computeTier(config, 10)
    expect(tier).toBeNull()
  })

  it("handles custom tier levels", () => {
    const config = makeConfig({
      tiers: {
        enabled: true,
        levels: [
          { name: "Bronze", minVisits: 0, maxVisits: 9 },
          { name: "Silver", minVisits: 10, maxVisits: 49 },
          { name: "Gold", minVisits: 50, maxVisits: null },
        ],
      },
    })
    expect(computeTier(config, 0)?.name).toBe("Bronze")
    expect(computeTier(config, 9)?.name).toBe("Bronze")
    expect(computeTier(config, 10)?.name).toBe("Silver")
    expect(computeTier(config, 49)?.name).toBe("Silver")
    expect(computeTier(config, 50)?.name).toBe("Gold")
    expect(computeTier(config, 999)?.name).toBe("Gold")
  })
})

// --- getNextTier ---

describe("getNextTier", () => {
  const defaultConfig = DEFAULT_STAMPS_CONFIG

  it("returns 'Frecuente' as next tier for 0 visits (currently Nuevo)", () => {
    const next = getNextTier(defaultConfig, 0)
    expect(next).toEqual({ name: "Frecuente", visitsNeeded: 5 })
  })

  it("returns 'Frecuente' with correct visits needed for 3 visits", () => {
    const next = getNextTier(defaultConfig, 3)
    expect(next).toEqual({ name: "Frecuente", visitsNeeded: 2 })
  })

  it("returns 'VIP' as next tier for 5 visits (currently Frecuente)", () => {
    const next = getNextTier(defaultConfig, 5)
    expect(next).toEqual({ name: "VIP", visitsNeeded: 15 })
  })

  it("returns 'VIP' with correct visits needed for 15 visits", () => {
    const next = getNextTier(defaultConfig, 15)
    expect(next).toEqual({ name: "VIP", visitsNeeded: 5 })
  })

  it("returns null for VIP (already at top tier)", () => {
    const next = getNextTier(defaultConfig, 20)
    expect(next).toBeNull()
  })

  it("returns null for 100 visits (well past top tier)", () => {
    const next = getNextTier(defaultConfig, 100)
    expect(next).toBeNull()
  })

  it("returns null when tiers are disabled", () => {
    const config = makeConfig({ tiers: { enabled: false, levels: [] } })
    expect(getNextTier(config, 5)).toBeNull()
  })

  it("returns null when levels array is empty", () => {
    const config = makeConfig({ tiers: { enabled: true, levels: [] } })
    expect(getNextTier(config, 5)).toBeNull()
  })

  it("handles single-tier config (no next tier possible)", () => {
    const config = makeConfig({
      tiers: {
        enabled: true,
        levels: [{ name: "Everyone", minVisits: 0, maxVisits: null }],
      },
    })
    expect(getNextTier(config, 0)).toBeNull()
  })
})
