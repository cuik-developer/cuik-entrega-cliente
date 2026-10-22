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
  /** How many gifts this notice covers (a x2/x3 visit can cross several). */
  count: number
  /** Text shown on the pass and pushed to the phone; null when that notice is disabled. */
  message: string | null
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
export function renderMilestoneMessage(template: string, milestone: StampMilestone): string | null {
  const text = template
    .replaceAll("{premio}", milestone.label)
    .replaceAll("{visita}", String(milestone.at))
    .trim()
  return text || null
}

/**
 * Which notice, if any, a visit triggers.
 *
 * `before` / `after` are positions in the cycle (0 = empty card). A visit may
 * add several stamps (bonus) and may complete the cycle, in which case `after`
 * is the position in the NEW cycle and `wrapped` is true.
 *
 * Priority: the milestones crossed by this visit ("reached"), otherwise the
 * milestone sitting exactly one visit ahead ("next"). A x2/x3 visit can cross
 * several gifts at once: all of them are reported in one notice, so none is
 * forgotten at the till ("Café (visita 3) y Postre (visita 4)"). A visit that completes
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
    // In delivery order: when the cycle wrapped, the old cycle's gifts come
    // first and the new cycle's last (the most recent one leads `at`).
    const ordered = wrapped
      ? [...crossed.filter((m) => m.at > before), ...crossed.filter((m) => m.at <= after)]
      : crossed
    const last = ordered[ordered.length - 1]
    const pick: StampMilestone =
      ordered.length === 1
        ? last
        : {
            at: last.at,
            label: ordered.map((m) => `${m.label} (visita ${m.at})`).join(" y "),
          }
    return {
      kind: "reached",
      at: pick.at,
      // The cashier gets every gift in `label`; the pass text is the last
      // gift's own message, so allMilestoneMessages recognises it and the
      // next visit clears it like any other milestone notice.
      label: pick.label,
      count: ordered.length,
      message: renderMilestoneMessage(settings.milestoneMessages.reached, last),
    }
  }

  if (wrapped) return null
  const next = list.find((m) => m.at === after + 1)
  if (!next) return null
  return {
    kind: "next",
    at: next.at,
    label: next.label,
    count: 1,
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
    const next = renderMilestoneMessage(settings.milestoneMessages.next, m)
    const reached = renderMilestoneMessage(settings.milestoneMessages.reached, m)
    if (next) out.add(next)
    if (reached) out.add(reached)
  }
  return out
}

/** Short description for admin screens: "4: Café · 8: Postre". */
export function describeMilestones(settings: MilestoneSettings, maxVisits: number): string | null {
  const list = activeMilestones(settings, maxVisits)
  if (list.length === 0) return null
  return list.map((m) => `${m.at}: ${m.label}`).join(" · ")
}
