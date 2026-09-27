import { describe, expect, it } from "vitest"
import { createPromotionSchema, expirationPolicySchema } from "./promotion-schema"

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
