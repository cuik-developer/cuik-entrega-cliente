import type { MilestoneMessages, StampMilestone } from "@cuik/shared/validators"

/**
 * Intermediate rewards inside a stamps cycle ("escalera": a gift at visit 4,
 * another at 8, the big one when the card is complete).
 *
 * The system does not record these gifts as rewards: the business hands them
 * over itself. What the system does is tell people at the right moment:
 *  - the client, through the pass, one visit before ("next") and on the visit
 *    that reaches the milestone ("reached");
 *  - the cashier, on the scan screen, so the gift is not forgotten.
 *
 * The reward of the full cycle keeps its own flow (pending reward, redemption).
 */

export type MilestoneNotice = {
  kind: "next" | "reached"
  /** Position in the cycle the notice is about (1-based). */
  at: number
  label: string
  /** Text shown on the pass and pushed to the phone. */
  message: string
}

export type MilestoneSettings = {
  milestones: StampMilestone[]
  milestoneMessages: MilestoneMessages
}

/** Milestones that make sense for this cycle length, sorted. */
export function activeMilestones(settings: MilestoneSettings, maxVisits: number): StampMilestone[] {
  return settings.milestones
    .filter((m) => m.at >= 1 && m.at < maxVisits)
    .sort((a, b) => a.at - b.at)
}

/** `{premio}` and `{visita}` are the only placeholders; unknown ones are left as-is. */
export function renderMilestoneMessage(template: string, milestone: StampMilestone): string {
  return template
    .replaceAll("{premio}", milestone.label)
    .replaceAll("{visita}", String(milestone.at))
    .trim()
}

/**
 * Which notice, if any, a visit triggers.
 *
 * `before` / `after` are positions in the cycle (0 = empty card). A visit may
 * add several stamps (bonus) and may complete the cycle, in which case `after`
 * is the position in the NEW cycle and `wrapped` is true.
 *
 * Priority: the highest milestone crossed by this visit ("reached"), otherwise
 * the milestone sitting exactly one visit ahead ("next"). A visit that completes
 * the cycle never says "next" for the new cycle: the client is busy with the
 * real reward.
 */
export function milestoneNoticeFor(
  settings: MilestoneSettings,
  maxVisits: number,
  position: { before: number; after: number; wrapped: boolean },
): MilestoneNotice | null {
  const list = activeMilestones(settings, maxVisits)
  if (list.length === 0) return null
  const { before, after, wrapped } = position

  const crossed = list.filter((m) =>
    wrapped ? m.at <= after || m.at > before : m.at > before && m.at <= after,
  )
  if (crossed.length > 0) {
    // When the cycle wrapped, the ones in the new cycle are the most recent.
    const inNewCycle = wrapped ? crossed.filter((m) => m.at <= after) : []
    const pick = inNewCycle.at(-1) ?? crossed.at(-1)
    if (pick) {
      return {
        kind: "reached",
        at: pick.at,
        label: pick.label,
        message: renderMilestoneMessage(settings.milestoneMessages.reached, pick),
      }
    }
  }

  if (wrapped) return null
  const next = list.find((m) => m.at === after + 1)
  if (!next) return null
  return {
    kind: "next",
    at: next.at,
    label: next.label,
    message: renderMilestoneMessage(settings.milestoneMessages.next, next),
  }
}

/**
 * Every text a milestone notice can put on a pass of this promotion. Used to
 * tell a stale milestone notice apart from a campaign message when deciding
 * whether a later visit should clear it.
 */
export function allMilestoneMessages(settings: MilestoneSettings, maxVisits: number): Set<string> {
  const out = new Set<string>()
  for (const m of activeMilestones(settings, maxVisits)) {
    out.add(renderMilestoneMessage(settings.milestoneMessages.next, m))
    out.add(renderMilestoneMessage(settings.milestoneMessages.reached, m))
  }
  return out
}

/** Short description for admin screens: "4: Café · 8: Postre". */
export function describeMilestones(settings: MilestoneSettings, maxVisits: number): string | null {
  const list = activeMilestones(settings, maxVisits)
  if (list.length === 0) return null
  return list.map((m) => `${m.at}: ${m.label}`).join(" · ")
}
