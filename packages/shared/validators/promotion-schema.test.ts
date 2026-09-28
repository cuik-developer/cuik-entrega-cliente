import { describe, expect, it } from "vitest"
import {
  createPromotionSchema,
  describePointsRate,
  expirationPolicySchema,
  pointsForAmount,
  pointsPromotionConfigSchema,
} from "./promotion-schema"

describe("createPromotionSchema", () => {
  it("keeps a points config as points (regression: union used to collapse it into stamps)", () => {
    const parsed = createPromotionSchema.parse({
      type: "points",
      rewardValue: "Canje del catálogo",
      config: {
        points: { pointsPerCurrency: 2, minimumPurchaseForPoints: 15, maxVisitsPerDay: 2 },
        accumulation: { birthdayMultiplier: 2 },
      },
    })
    expect(parsed.type).toBe("points")
    expect("points" in parsed.config).toBe(true)
    expect("stamps" in parsed.config).toBe(false)
    const cfg = parsed.config as {
      points: Record<string, unknown>
      accumulation: Record<string, unknown>
    }
    expect(cfg.points.pointsPerCurrency).toBe(2)
    expect(cfg.points.minimumPurchaseForPoints).toBe(15)
    expect(cfg.points.maxVisitsPerDay).toBe(2)
    expect(cfg.accumulation.birthdayMultiplier).toBe(2)
  })

  it("fills points defaults when config is omitted", () => {
    const parsed = createPromotionSchema.parse({ type: "points", rewardValue: "x" })
    const cfg = parsed.config as { points: { pointsPerCurrency: number } }
    expect(cfg.points.pointsPerCurrency).toBe(1)
  })

  it("still parses a stamps config as stamps", () => {
    const parsed = createPromotionSchema.parse({
      type: "stamps",
      maxVisits: 8,
      rewardValue: "Café gratis",
      config: { stamps: { maxVisitsPerDay: 2 } },
    })
    expect("stamps" in parsed.config).toBe(true)
    expect((parsed.config as { stamps: { maxVisitsPerDay: number } }).stamps.maxVisitsPerDay).toBe(
      2,
    )
  })

  it("reports config errors under the config path", () => {
    const res = createPromotionSchema.safeParse({
      type: "points",
      rewardValue: "x",
      config: { points: { pointsPerCurrency: -1 } },
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].path[0]).toBe("config")
  })
})

describe("expirationPolicySchema", () => {
  it("reads the legacy {type, value} shape as never", () => {
    expect(expirationPolicySchema.parse({ type: "months", value: 12 })).toEqual({ mode: "never" })
  })
  it("accepts every mode with its parameters", () => {
    expect(expirationPolicySchema.parse({ mode: "rolling", days: 7 })).toEqual({
      mode: "rolling",
      days: 7,
    })
    expect(expirationPolicySchema.parse({ mode: "weekly", weekday: 4 })).toEqual({
      mode: "weekly",
      weekday: 4,
    })
    expect(expirationPolicySchema.parse({ mode: "monthly", weekday: 4, ordinal: "last" })).toEqual({
      mode: "monthly",
      weekday: 4,
      ordinal: "last",
    })
    expect(
      expirationPolicySchema.parse({ mode: "interval", days: 10, anchor: "2026-09-21" }),
    ).toEqual({ mode: "interval", days: 10, anchor: "2026-09-21" })
  })
  it("rejects a rolling policy without days and a bad anchor", () => {
    expect(expirationPolicySchema.safeParse({ mode: "rolling" }).success).toBe(false)
    expect(
      expirationPolicySchema.safeParse({ mode: "interval", days: 7, anchor: "21/09/2026" }).success,
    ).toBe(false)
  })
  it("defaults the points config to never", () => {
    const parsed = createPromotionSchema.parse({ type: "points", rewardValue: "x" })
    const cfg = parsed.config as { points: { pointsExpiration: { mode: string } } }
    expect(cfg.points.pointsExpiration).toEqual({ mode: "never" })
  })
})

describe("points calc mode", () => {
  it("defaults to per_currency when calcMode is absent (legacy configs)", () => {
    const cfg = pointsPromotionConfigSchema.parse({ points: { pointsPerCurrency: 0.22 } })
    expect(cfg.points.calcMode).toBe("per_currency")
    expect(cfg.points.solesPerPoint).toBeNull()
    expect(cfg.points.pointsPerCurrency).toBe(0.22)
  })

  it("accepts currency_per_point with solesPerPoint", () => {
    const cfg = pointsPromotionConfigSchema.parse({
      points: { calcMode: "currency_per_point", solesPerPoint: 4.5 },
    })
    expect(cfg.points.calcMode).toBe("currency_per_point")
    expect(cfg.points.solesPerPoint).toBe(4.5)
  })

  it("rejects currency_per_point without solesPerPoint", () => {
    const r = pointsPromotionConfigSchema.safeParse({ points: { calcMode: "currency_per_point" } })
    expect(r.success).toBe(false)
  })
})

describe("pointsForAmount", () => {
  it("currency_per_point: S/ 4.49 -> 0, S/ 4.50 -> 1, S/ 13.50 -> 3, S/ 50 -> 11", () => {
    const rate = {
      calcMode: "currency_per_point" as const,
      solesPerPoint: 4.5,
      roundingMethod: "floor" as const,
    }
    expect(pointsForAmount(4.49, rate)).toBe(0)
    expect(pointsForAmount(4.5, rate)).toBe(1)
    expect(pointsForAmount(13.5, rate)).toBe(3)
    expect(pointsForAmount(50, rate)).toBe(11)
  })

  it("per_currency keeps the legacy multiply semantics", () => {
    expect(pointsForAmount(20, { pointsPerCurrency: 2 })).toBe(40)
    expect(pointsForAmount(4.5, { pointsPerCurrency: 0.22, roundingMethod: "ceil" })).toBe(1)
    expect(pointsForAmount(4.5, { pointsPerCurrency: 0.22, roundingMethod: "floor" })).toBe(0)
  })

  it("is immune to binary floating point noise", () => {
    // 100 * 0.29 = 28.999999999999996 in JS
    expect(pointsForAmount(100, { pointsPerCurrency: 0.29, roundingMethod: "floor" })).toBe(29)
    // 100 * 0.07 = 7.000000000000001 in JS
    expect(pointsForAmount(100, { pointsPerCurrency: 0.07, roundingMethod: "ceil" })).toBe(7)
    // 0.3 / 0.1 = 2.9999999999999996 in JS
    expect(pointsForAmount(0.3, { calcMode: "currency_per_point", solesPerPoint: 0.1 })).toBe(3)
  })

  it("returns 0 for missing or invalid inputs", () => {
    expect(pointsForAmount(0, { pointsPerCurrency: 1 })).toBe(0)
    expect(pointsForAmount(10, { calcMode: "currency_per_point", solesPerPoint: null })).toBe(0)
  })
})

describe("describePointsRate", () => {
  it("labels both modes", () => {
    expect(describePointsRate({ calcMode: "currency_per_point", solesPerPoint: 4.5 })).toBe(
      "1 punto por cada S/ 4.50",
    )
    expect(describePointsRate({ calcMode: "currency_per_point", solesPerPoint: 5 })).toBe(
      "1 punto por cada S/ 5",
    )
    expect(describePointsRate({ pointsPerCurrency: 1 })).toBe("1 punto por sol")
    expect(describePointsRate({ pointsPerCurrency: 2 })).toBe("2 puntos por sol")
    expect(describePointsRate({})).toBe("1 punto por sol")
  })
})
