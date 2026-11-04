import { DEFAULT_MILESTONE_MESSAGES, stampsPromotionConfigSchema } from "@cuik/shared/validators"
import { describe, expect, it } from "vitest"

import {
  allMilestoneMessages,
  cashOutNoticeFor,
  cashOutOfferFor,
  describeMilestones,
  milestoneNoticeFor,
  redeemableMilestone,
} from "./milestones"
import { cyclesCompletedOf, effectiveVisits, stampsInCycleOf } from "./stamps"
import { VOID_WINDOW_MINUTES, withinVoidWindow } from "./void-redemption"

// The example of the demo: 10 stamps, S/ 10 at 10, S/ 5 cashable from stamp 5.
const MAX = 10
const ladder = {
  milestones: [{ at: 5, label: "Cashback S/ 5", redeemable: true }],
  milestoneMessages: { ...DEFAULT_MILESTONE_MESSAGES },
}

describe("stamp arithmetic with early cash-outs", () => {
  it("is the old totalVisits % maxVisits when nothing was cashed", () => {
    for (let total = 0; total < 40; total++) {
      const c = { totalVisits: total, stampsCashed: 0 }
      expect(stampsInCycleOf(c, MAX)).toBe(total % MAX)
      expect(cyclesCompletedOf(c, MAX)).toBe(Math.floor(total / MAX))
    }
  })

  it("subtracts the cashed stamps and keeps the extras (7 cashed at 5 leaves 2)", () => {
    const c = { totalVisits: 7, stampsCashed: 5 }
    expect(effectiveVisits(c)).toBe(2)
    expect(stampsInCycleOf(c, MAX)).toBe(2)
    expect(cyclesCompletedOf(c, MAX)).toBe(0)
  })

  it("needs the full card again after a cash-out (2 + 8 visits completes it)", () => {
    const c = { totalVisits: 7 + 8, stampsCashed: 5 }
    expect(stampsInCycleOf(c, MAX)).toBe(0)
    expect(cyclesCompletedOf(c, MAX)).toBe(1)
  })

  it("never goes below an empty card", () => {
    expect(effectiveVisits({ totalVisits: 3, stampsCashed: 5 })).toBe(0)
    expect(stampsInCycleOf({ totalVisits: 3, stampsCashed: 5 }, MAX)).toBe(0)
  })

  it("is 0 without a cycle length", () => {
    expect(stampsInCycleOf({ totalVisits: 7, stampsCashed: 0 }, 0)).toBe(0)
    expect(cyclesCompletedOf({ totalVisits: 7, stampsCashed: 0 }, 0)).toBe(0)
  })
})

describe("cashOutOfferFor (window from stamp 5 to 9)", () => {
  it("is closed before the milestone", () => {
    expect(cashOutOfferFor(ladder, MAX, 0)).toBeNull()
    expect(cashOutOfferFor(ladder, MAX, 4)).toBeNull()
  })

  it("opens at the milestone and spends its stamps", () => {
    expect(cashOutOfferFor(ladder, MAX, 5)).toEqual({
      at: 5,
      label: "Cashback S/ 5",
      stamps: 5,
      stampsAfter: 0,
    })
    expect(cashOutOfferFor(ladder, MAX, 7)?.stampsAfter).toBe(2)
    expect(cashOutOfferFor(ladder, MAX, 9)?.stampsAfter).toBe(4)
  })

  it("is closed at the full card (the final reward takes over)", () => {
    expect(cashOutOfferFor(ladder, MAX, 10)).toBeNull()
  })

  it("does not exist without a redeemable milestone", () => {
    const gifts = { ...ladder, milestones: [{ at: 5, label: "Café" }] }
    expect(redeemableMilestone(gifts, MAX)).toBeNull()
    expect(cashOutOfferFor(gifts, MAX, 7)).toBeNull()
  })

  it("ignores a redeemable milestone that does not fit the card", () => {
    const tooFar = { ...ladder, milestones: [{ at: 12, label: "X", redeemable: true }] }
    expect(cashOutOfferFor(tooFar, MAX, 9)).toBeNull()
  })
})

describe("milestoneNoticeFor with an early cash-out", () => {
  it("is never announced as a gift one visit before (it is optional)", () => {
    expect(milestoneNoticeFor(ladder, MAX, { before: 3, after: 4, wrapped: false })).toBeNull()
  })

  it("lets a gift on the next visit win over the cash-out reminder", () => {
    const withGift = { ...ladder, milestones: [...ladder.milestones, { at: 8, label: "Postre" }] }
    expect(
      milestoneNoticeFor(withGift, MAX, { before: 6, after: 7, wrapped: false }),
    ).toMatchObject({ kind: "next", at: 8, label: "Postre" })
  })

  it("gives the pass text for the cash-out only inside the window", () => {
    expect(cashOutNoticeFor(ladder, MAX, 4)).toBeNull()
    expect(cashOutNoticeFor(ladder, MAX, 6)).toBe(
      "Puedes cobrar Cashback S/ 5 en caja o seguir acumulando",
    )
  })

  it("never asks the cashier to hand it over: reaching it gives 'available'", () => {
    const n = milestoneNoticeFor(ladder, MAX, { before: 4, after: 5, wrapped: false })
    expect(n).toMatchObject({ kind: "available", at: 5, label: "Cashback S/ 5" })
    expect(n?.message).toBe("Puedes cobrar Cashback S/ 5 en caja o seguir acumulando")
  })

  it("keeps saying 'available' on later visits of the window, also after a x3 jump", () => {
    expect(milestoneNoticeFor(ladder, MAX, { before: 6, after: 7, wrapped: false })?.kind).toBe(
      "available",
    )
    expect(milestoneNoticeFor(ladder, MAX, { before: 4, after: 7, wrapped: false })?.kind).toBe(
      "available",
    )
  })

  it("says nothing when the visit completes the card", () => {
    expect(milestoneNoticeFor(ladder, MAX, { before: 9, after: 0, wrapped: true })).toBeNull()
  })

  it("still hands over a regular gift crossed together with the cash-out", () => {
    const both = {
      ...ladder,
      milestones: [{ at: 3, label: "Café" }, ...ladder.milestones],
    }
    const n = milestoneNoticeFor(both, MAX, { before: 2, after: 5, wrapped: false })
    expect(n).toMatchObject({ kind: "reached", at: 3, label: "Café", count: 1 })
  })

  it("lists the cash-out text among the pass texts so it is cleared later", () => {
    expect(allMilestoneMessages(ladder, MAX)).toContain(
      "Puedes cobrar Cashback S/ 5 en caja o seguir acumulando",
    )
  })

  it("marks it in the admin summary", () => {
    expect(describeMilestones(ladder, MAX)).toBe("5: Cashback S/ 5 (canjeable con reinicio)")
  })
})

describe("stamps config", () => {
  it("defaults milestones to not redeemable (existing tenants unchanged)", () => {
    const cfg = stampsPromotionConfigSchema.parse({
      stamps: { milestones: [{ at: 3, label: "Café" }] },
    })
    expect(cfg.stamps.milestones[0].redeemable).toBe(false)
    expect(cfg.stamps.milestoneMessages.cashOut).toBe(DEFAULT_MILESTONE_MESSAGES.cashOut)
  })

  it("allows only one redeemable milestone", () => {
    const res = stampsPromotionConfigSchema.safeParse({
      stamps: {
        milestones: [
          { at: 3, label: "A", redeemable: true },
          { at: 6, label: "B", redeemable: true },
        ],
      },
    })
    expect(res.success).toBe(false)
  })
})

describe("withinVoidWindow", () => {
  const redeemedAt = new Date("2026-11-04T15:00:00Z")
  it("allows the undo inside the window", () => {
    expect(withinVoidWindow(redeemedAt, new Date("2026-11-04T15:14:59Z"))).toBe(true)
    expect(
      withinVoidWindow(redeemedAt, new Date(redeemedAt.getTime() + VOID_WINDOW_MINUTES * 60_000)),
    ).toBe(true)
  })
  it("refuses it after the window or without a redemption time", () => {
    expect(withinVoidWindow(redeemedAt, new Date("2026-11-04T15:15:01Z"))).toBe(false)
    expect(withinVoidWindow(null)).toBe(false)
  })
})
