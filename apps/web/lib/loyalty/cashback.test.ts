import {
  type CashbackSettings,
  DEFAULT_CASHBACK_SETTINGS,
  stampsPromotionConfigSchema,
} from "@cuik/shared/validators"
import { describe, expect, it } from "vitest"

import {
  cashbackCentsFor,
  cashbackRewardLabel,
  cashbackTemplateVars,
  centsToNumeric,
  describeCashback,
  formatSoles,
  fromCents,
  toCents,
} from "./cashback"
import { evaluateStampRules } from "./rules-engine"
import type { RulesEvaluationContext } from "./types"

const five: CashbackSettings = { ...DEFAULT_CASHBACK_SETTINGS }

describe("money helpers", () => {
  it("moves between soles and cents without float noise", () => {
    expect(toCents("12.50")).toBe(1250)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(fromCents(1250)).toBe(12.5)
    expect(centsToNumeric(1250)).toBe("12.50")
    expect(centsToNumeric(5)).toBe("0.05")
    expect(toCents(null)).toBe(0)
    expect(toCents("abc")).toBe(0)
  })

  it("formats soles the same everywhere", () => {
    expect(formatSoles(12.5)).toBe("S/ 12.50")
    expect(formatSoles("88")).toBe("S/ 88.00")
    expect(formatSoles(null)).toBe("S/ 0.00")
  })
})

describe("cashbackCentsFor", () => {
  it("keeps the percentage of the purchase, rounded to S/ 0.10 by default", () => {
    expect(cashbackCentsFor(100, five)).toBe(500) // S/ 5.00
    expect(cashbackCentsFor("88.00", five)).toBe(440) // 4.40
    expect(cashbackCentsFor(37.9, five)).toBe(190) // 1.895 -> 1.90
    expect(cashbackCentsFor(1, five)).toBe(10) // 0.05 -> 0.10 (half up)
  })

  it("respects the rounding step", () => {
    expect(cashbackCentsFor(37.9, { ...five, roundTo: 0.01 })).toBe(190) // 1.895 -> 1.90 (cents)
    expect(cashbackCentsFor(37.9, { ...five, roundTo: 0.5 })).toBe(200)
    expect(cashbackCentsFor(37.9, { ...five, roundTo: 1 })).toBe(200)
    expect(cashbackCentsFor(126, { ...five, roundTo: 1 })).toBe(600) // 6.30 -> 6
  })

  it("multiplies the cashback on a bonus window and caps per purchase", () => {
    expect(cashbackCentsFor(100, five, 2)).toBe(1000)
    expect(cashbackCentsFor(1000, { ...five, maxPerPurchase: 20 })).toBe(2000)
    expect(cashbackCentsFor(1000, { ...five, maxPerPurchase: 20 }, 3)).toBe(2000)
  })

  it("gives nothing for a zero, negative or unreadable amount", () => {
    expect(cashbackCentsFor(0, five)).toBe(0)
    expect(cashbackCentsFor(-5, five)).toBe(0)
    expect(cashbackCentsFor("x", five)).toBe(0)
  })

  it("never multiplies below x1", () => {
    expect(cashbackCentsFor(100, five, 0)).toBe(500)
  })
})

describe("labels and template variables", () => {
  it("names the reward with the amount", () => {
    expect(cashbackRewardLabel(2500)).toBe("Cashback S/ 25.00")
  })

  it("formats balance, pending and total for the pass", () => {
    expect(cashbackTemplateVars(five, "12.50", "25.00")).toEqual({
      balance: "S/ 12.50",
      pending: "S/ 25.00",
      total: "S/ 37.50",
      percent: "5 %",
    })
    expect(cashbackTemplateVars({ ...five, percent: 7.5 }, null, null).percent).toBe("7.5 %")
  })

  it("describes the program for admin screens", () => {
    expect(describeCashback(five, 5)).toBe("5 % de cashback sobre las 5 compras de la tarjeta")
    expect(describeCashback({ ...five, maxPerPurchase: 20 }, 5)).toBe(
      "5 % de cashback sobre las 5 compras de la tarjeta (máx. S/ 20.00 por compra)",
    )
  })
})

describe("stamps config with a cashback reward", () => {
  it("defaults to a gift reward and keeps old configs valid", () => {
    const parsed = stampsPromotionConfigSchema.parse({})
    expect(parsed.stamps.rewardMode).toBe("gift")
    expect(parsed.stamps.cashback).toBeNull()
  })

  it("requires the settings when the reward is cashback", () => {
    expect(
      stampsPromotionConfigSchema.safeParse({ stamps: { rewardMode: "cashback" } }).success,
    ).toBe(false)
    const ok = stampsPromotionConfigSchema.safeParse({
      stamps: { rewardMode: "cashback", cashback: { percent: 5 } },
    })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.stamps.cashback).toEqual(five)
  })

  it("refuses a redeemable milestone next to cashback", () => {
    const bad = stampsPromotionConfigSchema.safeParse({
      stamps: {
        rewardMode: "cashback",
        cashback: { percent: 5 },
        milestones: [{ at: 3, label: "S/ 5", redeemable: true }],
      },
    })
    expect(bad.success).toBe(false)
    const gifts = stampsPromotionConfigSchema.safeParse({
      stamps: {
        rewardMode: "cashback",
        cashback: { percent: 5 },
        milestones: [{ at: 3, label: "Un café" }],
      },
    })
    expect(gifts.success).toBe(true)
  })

  it("rejects a percentage out of range or an unknown rounding step", () => {
    expect(
      stampsPromotionConfigSchema.safeParse({
        stamps: { rewardMode: "cashback", cashback: { percent: 60 } },
      }).success,
    ).toBe(false)
    expect(
      stampsPromotionConfigSchema.safeParse({
        stamps: { rewardMode: "cashback", cashback: { percent: 5, roundTo: 0.25 } },
      }).success,
    ).toBe(false)
  })
})

describe("stamp rules with a cashback reward", () => {
  // A Tuesday 10:00 in Lima.
  const visitDate = new Date("2026-11-10T15:00:00Z")
  const base: RulesEvaluationContext = {
    visitDate,
    visitDateLocal: "2026-11-10",
    timezone: "America/Lima",
    clientTotalVisits: 3,
    clientBirthday: null,
    visitAmount: 100,
    locationId: null,
    todayVisitCount: 0,
  }
  const cashbackConfig = (windowApplies?: "stamps" | "cashback" | "both") =>
    stampsPromotionConfigSchema.parse({
      stamps: { rewardMode: "cashback", cashback: { percent: 5 } },
      accumulation: windowApplies
        ? {
            bonusWindows: [
              {
                id: "w1",
                label: "Martes",
                kind: "weekly",
                days: [2],
                start: "08:00",
                end: "12:00",
                multiplier: 2,
                applies: windowApplies,
              },
            ],
          }
        : {},
    })

  it("needs the purchase amount even without a minimum", () => {
    const r = evaluateStampRules(cashbackConfig(), { ...base, visitAmount: null })
    expect(r.eligible).toBe(false)
    expect(r.rejectionReason).toBe("AMOUNT_REQUIRED")
    expect(evaluateStampRules(cashbackConfig(), base).eligible).toBe(true)
  })

  it("lets the merchant choose what a bonus window multiplies", () => {
    const stamps = evaluateStampRules(cashbackConfig("stamps"), base)
    expect(stamps.stampsToEarn).toBe(2)
    expect(stamps.cashbackMultiplier).toBe(1)

    const cashback = evaluateStampRules(cashbackConfig("cashback"), base)
    expect(cashback.stampsToEarn).toBe(1)
    expect(cashback.cashbackMultiplier).toBe(2)
    expect(cashback.bonusReasons).toEqual(["Martes (×2)"])

    const both = evaluateStampRules(cashbackConfig("both"), base)
    expect(both.stampsToEarn).toBe(2)
    expect(both.cashbackMultiplier).toBe(2)
    expect(both.bonusReasons).toEqual(["Martes (×2)"])
  })

  it("ignores `applies` when the reward is a gift: the window multiplies the stamps", () => {
    const gift = stampsPromotionConfigSchema.parse({
      accumulation: {
        bonusWindows: [
          {
            id: "w1",
            kind: "weekly",
            days: [2],
            start: "08:00",
            end: "12:00",
            multiplier: 3,
            applies: "cashback",
          },
        ],
      },
    })
    const r = evaluateStampRules(gift, base)
    expect(r.stampsToEarn).toBe(3)
    expect(r.cashbackMultiplier).toBe(1)
  })
})
