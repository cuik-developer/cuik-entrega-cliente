import {
  and,
  campaignSegments,
  campaigns,
  db,
  eq,
  notifications,
  recurringCampaigns,
  sql,
  tenants,
  visits,
} from "@cuik/db"
import type { SegmentFilter } from "@cuik/shared/types/campaign"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"
import { localDateString } from "@/lib/loyalty/expiration"
import { executeCampaign } from "./execute-campaign"
import { computeNextRun, pushGuardSince, type RecurrenceRule, type WeekOfMonth } from "./recurrence"
import { resolveSegment } from "./resolve-segment"

/**
 * Runner for recurring campaigns, called by the scheduled-campaigns cron.
 *
 * For every active template whose next_run_at has passed:
 *  1. claim it (optimistic update of next_run_at, so two cron ticks never send twice)
 *  2. resolve the audience now (segment + per-client guards)
 *  3. materialize an ordinary campaign row linked by recurring_id and execute it
 *  4. bookkeeping: rotation index, counters, empty streak, auto-pause/finish
 *
 * A template that is too late (cron was down) is advanced without sending:
 * "todos los miércoles a las 10" must not fire on Thursday.
 */

const MISSED_WINDOW_MS = 6 * 60 * 60 * 1000
const EMPTY_STREAK_TO_PAUSE = 3

export type RecurringRunResult = {
  processed: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

type Template = typeof recurringCampaigns.$inferSelect

export function ruleOf(t: Template): RecurrenceRule {
  return {
    frequency: t.frequency,
    intervalWeeks: t.intervalWeeks,
    weekdays: t.weekdays,
    // DB stores an int with a CHECK (1..4, -1); narrow it back for the engine.
    weekOfMonth: (t.weekOfMonth as WeekOfMonth | null) ?? null,
    sendHour: t.sendHour,
    sendMinute: t.sendMinute,
    startsOn: t.startsOn,
    endsOn: t.endsOn,
    maxOccurrences: t.maxOccurrences,
  }
}

export async function runDueRecurringCampaigns(now = new Date()): Promise<RecurringRunResult> {
  const result: RecurringRunResult = { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] }

  const due = await db
    .select()
    .from(recurringCampaigns)
    .where(
      and(
        eq(recurringCampaigns.status, "active"),
        // timestamp WITHOUT tz holding UTC wall time: compare against an ISO string
        // cast to timestamp so the session TimeZone never shifts the comparison.
        sql`${recurringCampaigns.nextRunAt} IS NOT NULL AND ${recurringCampaigns.nextRunAt} <= ${now.toISOString()}::timestamp`,
      ),
    )

  for (const template of due) {
    try {
      const outcome = await runOne(template, now)
      result.processed++
      if (outcome.kind === "sent") result.sent++
      else if (outcome.kind === "failed") {
        result.failed++
        result.errors.push(`Recurring ${template.id} (${template.name}): ${outcome.error}`)
      } else result.skipped++
    } catch (err) {
      result.errors.push(
        `Recurring ${template.id}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
  return result
}

type RunOutcome = { kind: "sent" } | { kind: "skipped" } | { kind: "failed"; error: string }

async function runOne(template: Template, now: Date): Promise<RunOutcome> {
  const [tenant] = await db
    .select({
      timezone: tenants.timezone,
      businessType: tenants.businessType,
      segmentationConfig: tenants.segmentationConfig,
    })
    .from(tenants)
    .where(eq(tenants.id, template.tenantId))
    .limit(1)
  const timezone = tenant?.timezone ?? "America/Lima"
  const rule = ruleOf(template)
  const scheduledFor = template.nextRunAt as Date

  // Claim: whoever moves next_run_at into the future first owns this
  // occurrence. The condition re-checks "still due" instead of equality so a
  // value with microseconds (or a concurrent tick) can never double-send.
  const next = computeNextRun(rule, now, timezone, template.occurrencesCount + 1)
  const claimed = await db
    .update(recurringCampaigns)
    .set({ nextRunAt: next, lastRunAt: now, updatedAt: now })
    .where(
      and(
        eq(recurringCampaigns.id, template.id),
        eq(recurringCampaigns.status, "active"),
        sql`${recurringCampaigns.nextRunAt} IS NOT NULL AND ${recurringCampaigns.nextRunAt} <= ${now.toISOString()}::timestamp`,
      ),
    )
    .returning({ id: recurringCampaigns.id })
  if (claimed.length === 0) return { kind: "skipped" }

  // Too late to be the campaign the admin meant: advance, don't send. The
  // missed slot does not count as an occurrence, so "después de N envíos"
  // still delivers N (the claim above assumed it would be sent).
  if (now.getTime() - scheduledFor.getTime() > MISSED_WINDOW_MS) {
    const nextWithoutConsuming = computeNextRun(rule, now, timezone, template.occurrencesCount)
    await db
      .update(recurringCampaigns)
      .set({ nextRunAt: nextWithoutConsuming, updatedAt: now })
      .where(eq(recurringCampaigns.id, template.id))
    console.warn(
      `[Recurring] ${template.id} missed its slot (${scheduledFor.toISOString()}), skipped; next=${nextWithoutConsuming?.toISOString() ?? "none"}`,
    )
    await finishIfDone(template.id, nextWithoutConsuming)
    return { kind: "skipped" }
  }

  // Audience: segment now, minus per-client guards.
  const thresholds = getThresholds(
    tenant?.businessType,
    tenant?.segmentationConfig as Partial<SegmentationThresholds> | null,
  )
  const { clientIds } = await resolveSegment(
    template.tenantId,
    template.segmentFilter as SegmentFilter,
    thresholds,
  )
  const recipients = await applyGuards(template, clientIds, now)

  // Nobody left: do not materialize a campaign. An empty clientIds filter would
  // be read by resolveSegment as "no explicit list" and fall back to everyone.
  if (recipients.length === 0) {
    const emptyStreak = template.emptyStreak + 1
    const autoPause = emptyStreak >= EMPTY_STREAK_TO_PAUSE
    await db
      .update(recurringCampaigns)
      .set({
        occurrencesCount: template.occurrencesCount + 1,
        emptyStreak,
        ...(autoPause
          ? {
              status: "paused" as const,
              pausedReason: `Sin destinatarios en ${EMPTY_STREAK_TO_PAUSE} envíos seguidos`,
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(recurringCampaigns.id, template.id))
    if (!autoPause) await finishIfDone(template.id, next)
    console.info(
      `[Recurring] ${template.id} occurrence=${template.occurrencesCount + 1} segment=${clientIds.length} recipients=0 (no campaign created) streak=${emptyStreak}`,
    )
    return { kind: "skipped" }
  }

  const messages = template.messages
  const message = messages[template.nextMessageIndex % Math.max(messages.length, 1)] ?? ""
  const dateLabel = localDateString(now, timezone)

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: template.tenantId,
      name: `${template.name} · ${dateLabel}`,
      type: template.type,
      message,
      status: "draft",
      recurringId: template.id,
      createdBy: template.createdBy,
      content: {
        automation: "recurring",
        recurringId: template.id,
        occurrence: template.occurrencesCount + 1,
        scheduledFor: scheduledFor.toISOString(),
        segmentCount: clientIds.length,
        afterGuards: recipients.length,
      },
    })
    .returning({ id: campaigns.id })
  await db.insert(campaignSegments).values({
    campaignId: campaign.id,
    segmentName: "recurrente",
    filter: { clientIds: recipients },
  })

  const exec = await executeCampaign(campaign.id)
  const delivered = exec.status !== "failed"

  // A failed send (credentials down, every push rejected) consumes the slot
  // but not the message: the same text goes out next time, and the error is
  // surfaced in the cron response instead of being counted as a send.
  await db
    .update(recurringCampaigns)
    .set({
      occurrencesCount: template.occurrencesCount + 1,
      ...(delivered
        ? {
            nextMessageIndex: (template.nextMessageIndex + 1) % Math.max(messages.length, 1),
            emptyStreak: 0,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(recurringCampaigns.id, template.id))
  await finishIfDone(template.id, next)

  console.info(
    `[Recurring] ${template.id} occurrence=${template.occurrencesCount + 1} segment=${clientIds.length} recipients=${recipients.length} sent=${exec.sentCount} status=${exec.status} next=${next?.toISOString() ?? "none"}`,
  )
  if (!delivered) return { kind: "failed", error: exec.errors[0] ?? "send failed" }
  return { kind: "sent" }
}

/** No next run → the template has run its course. */
async function finishIfDone(id: string, next: Date | null) {
  if (next) return
  await db
    .update(recurringCampaigns)
    .set({ status: "finished", updatedAt: new Date() })
    .where(and(eq(recurringCampaigns.id, id), eq(recurringCampaigns.status, "active")))
}

/**
 * Drops clients who visited in the last `skipIfVisitedDays` days, and clients
 * who already got a campaign push in the last `minDaysSincePush` days.
 */
async function applyGuards(template: Template, clientIds: string[], now: Date): Promise<string[]> {
  if (clientIds.length === 0) return []
  let kept = new Set(clientIds)
  const idList = () =>
    sql.join(
      [...kept].map((id) => sql`${id}::uuid`),
      sql`, `,
    )

  if (template.skipIfVisitedDays && kept.size > 0) {
    const since = new Date(now.getTime() - template.skipIfVisitedDays * 86_400_000)
    const rows = await db
      .selectDistinct({ clientId: visits.clientId })
      .from(visits)
      .where(
        and(
          sql`${visits.clientId} IN (${idList()})`,
          sql`${visits.createdAt} >= ${since.toISOString()}::timestamp`,
        ),
      )
    for (const r of rows) kept.delete(r.clientId)
  }

  if (template.minDaysSincePush && kept.size > 0) {
    const since = pushGuardSince(now, template.minDaysSincePush)
    const rows = await db
      .selectDistinct({ clientId: notifications.clientId })
      .from(notifications)
      .where(
        and(
          sql`${notifications.clientId} IN (${idList()})`,
          eq(notifications.status, "sent"),
          sql`${notifications.sentAt} >= ${since.toISOString()}::timestamp`,
        ),
      )
    for (const r of rows) kept.delete(r.clientId)
  }

  kept = new Set([...kept])
  return [...kept]
}
