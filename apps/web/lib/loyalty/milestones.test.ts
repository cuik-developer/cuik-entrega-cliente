import { DEFAULT_MILESTONE_MESSAGES } from "@cuik/shared/validators"
import { describe, expect, it } from "vitest"
import {
  activeMilestones,
  allMilestoneMessages,
  describeMilestones,
  milestoneNoticeFor,
  renderMilestoneMessage,
} from "./milestones"

const settings = {
  milestones: [
    { at: 8, label: "Postre" },
    { at: 4, label: "Café" },
    { at: 12, label: "Ignorado (es el fin del ciclo)" },
  ],
  milestoneMessages: { ...DEFAULT_MILESTONE_MESSAGES },
}
const MAX = 12

describe("activeMilestones", () => {
  it("drops milestones at or beyond the cycle length and sorts", () => {
    expect(activeMilestones(settings, MAX).map((m) => m.at)).toEqual([4, 8])
  })
})

describe("renderMilestoneMessage", () => {
  it("fills {premio} and {visita}", () => {
    expect(renderMilestoneMessage("Visita {visita}: {premio}", { at: 4, label: "Café" })).toBe(
      "Visita 4: Café",
    )
  })
})

describe("milestoneNoticeFor", () => {
  it("announces the milestone one visit before", () => {
    const n = milestoneNoticeFor(settings, MAX, { before: 2, after: 3, wrapped: false })
    expect(n).toMatchObject({ kind: "next", at: 4, label: "Café" })
    expect(n?.message).toBe("Tu próxima visita tiene premio: Café")
  })

  it("announces the gift on the milestone visit", () => {
    const n = milestoneNoticeFor(settings, MAX, { before: 3, after: 4, wrapped: false })
    expect(n).toMatchObject({ kind: "reached", at: 4 })
    expect(n?.message).toBe("¡Hoy tienes un premio: Café! Pídelo en caja")
  })

  it("is silent on ordinary visits", () => {
    expect(milestoneNoticeFor(settings, MAX, { before: 4, after: 5, wrapped: false })).toBeNull()
    expect(milestoneNoticeFor(settings, MAX, { before: 0, after: 1, wrapped: false })).toBeNull()
  })

  it("prefers the gift owed over the teaser when a bonus visit crosses a milestone", () => {
    expect(
      milestoneNoticeFor(settings, MAX, { before: 2, after: 4, wrapped: false }),
    ).toMatchObject({ kind: "reached", at: 4 })
    // 3 -> 7: crossed 4, now one before 8
    expect(
      milestoneNoticeFor(settings, MAX, { before: 3, after: 7, wrapped: false }),
    ).toMatchObject({ kind: "reached", at: 4 })
  })

  it("takes the highest milestone when several are crossed at once", () => {
    expect(
      milestoneNoticeFor(settings, MAX, { before: 3, after: 9, wrapped: false }),
    ).toMatchObject({ kind: "reached", at: 8 })
  })

  it("never teases the next cycle on the visit that completes the card", () => {
    expect(milestoneNoticeFor(settings, MAX, { before: 11, after: 0, wrapped: true })).toBeNull()
    expect(milestoneNoticeFor(settings, MAX, { before: 11, after: 3, wrapped: true })).toBeNull()
  })

  it("reports a milestone crossed inside the new cycle after wrapping", () => {
    expect(
      milestoneNoticeFor(settings, MAX, { before: 11, after: 4, wrapped: true }),
    ).toMatchObject({ kind: "reached", at: 4 })
  })

  it("reports a milestone crossed at the end of the old cycle when wrapping", () => {
    // 7 -> 12 (+5 bonus): crossed 8, card complete
    expect(milestoneNoticeFor(settings, MAX, { before: 7, after: 0, wrapped: true })).toMatchObject(
      { kind: "reached", at: 8 },
    )
  })

  it("returns null without milestones", () => {
    expect(
      milestoneNoticeFor({ milestones: [], milestoneMessages: settings.milestoneMessages }, MAX, {
        before: 3,
        after: 4,
        wrapped: false,
      }),
    ).toBeNull()
  })
})

describe("allMilestoneMessages / describeMilestones", () => {
  it("lists every text a notice can put on the pass", () => {
    const all = allMilestoneMessages(settings, MAX)
    expect(all.has("Tu próxima visita tiene premio: Postre")).toBe(true)
    expect(all.has("¡Hoy tienes un premio: Café! Pídelo en caja")).toBe(true)
    expect(all.size).toBe(4)
  })

  it("describes the ladder", () => {
    expect(describeMilestones(settings, MAX)).toBe("4: Café · 8: Postre")
    expect(describeMilestones({ ...settings, milestones: [] }, MAX)).toBeNull()
  })
})
