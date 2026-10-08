import { campaigns, db, eq, recurringCampaigns, sql } from "@cuik/db"
import type { CreateRecurringCampaignInput } from "@cuik/shared/validators"
import { computeNextRun, describeRecurrence, nextOccurrences } from "./recurrence"
import { ruleOf } from "./recurring"

/**
 * Shared helpers for the recurring-campaigns API routes: DB row → API shape,
 * and the aggregated results per template.
 */

type Row = typeof recurringCampaigns.$inferSelect

export type RecurringStats = {
  sends: number
  totalTarget: number
  totalSent: number
  lastSentAt: string | null
}

export function toApi(row: Row, timezone: string, stats?: RecurringStats) {
  const rule = ruleOf(row)
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    messages: row.messages,
    nextMessageIndex: row.nextMessageIndex,
    segment: row.segmentFilter,
    rule,
    description: describeRecurrence(rule),
    skipIfVisitedDays: row.skipIfVisitedDays,
    minDaysSincePush: row.minDaysSincePush,
    status: row.status,
    pausedReason: row.pausedReason,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    occurrencesCount: row.occurrencesCount,
    upcoming:
      row.status === "active"
        ? nextOccurrences(rule, new Date(), timezone, 3, row.occurrencesCount).map((d) =>
            d.toISOString(),
          )
        : [],
    stats: stats ?? { sends: 0, totalTarget: 0, totalSent: 0, lastSentAt: null },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function statsFor(ids: string[]): Promise<Map<string, RecurringStats>> {
  const out = new Map<string, RecurringStats>()
  if (ids.length === 0) return out
  const rows = await db
    .select({
      recurringId: campaigns.recurringId,
      sends: sql<number>`count(*)::int`,
      totalTarget: sql<number>`coalesce(sum(${campaigns.targetCount}), 0)::int`,
      totalSent: sql<number>`coalesce(sum(${campaigns.sentCount}), 0)::int`,
      lastSentAt: sql<Date | null>`max(${campaigns.sentAt})`,
    })
    .from(campaigns)
    .where(
      sql`${campaigns.recurringId} IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) AND ${campaigns.status} = 'sent'`,
    )
    .groupBy(campaigns.recurringId)
  for (const r of rows) {
    if (!r.recurringId) continue
    out.set(r.recurringId, {
      sends: r.sends,
      totalTarget: r.totalTarget,
      totalSent: r.totalSent,
      lastSentAt: r.lastSentAt ? new Date(r.lastSentAt).toISOString() : null,
    })
  }
  return out
}

/** Column values for an insert/update from the validated API body. */
export function columnsFrom(input: CreateRecurringCampaignInput) {
  return {
    name: input.name,
    type: input.type,
    messages: input.messages,
    segmentFilter: input.segment,
    frequency: input.rule.frequency,
    intervalWeeks: input.rule.intervalWeeks,
    weekdays: input.rule.weekdays,
    weekOfMonth:
      input.rule.frequency === "monthly_weekday" ? (input.rule.weekOfMonth ?? null) : null,
    sendHour: input.rule.sendHour,
    sendMinute: input.rule.sendMinute,
    startsOn: input.rule.startsOn,
    endsOn: input.rule.endsOn ?? null,
    maxOccurrences: input.rule.maxOccurrences ?? null,
    skipIfVisitedDays: input.skipIfVisitedDays ?? null,
    minDaysSincePush: input.minDaysSincePush ?? null,
  }
}

export async function loadOwned(id: string, tenantId: string): Promise<Row | null> {
  const [row] = await db
    .select()
    .from(recurringCampaigns)
    .where(
      sql`${recurringCampaigns.id} = ${id}::uuid AND ${recurringCampaigns.tenantId} = ${tenantId}`,
    )
    .limit(1)
  return row ?? null
}

export { computeNextRun, eq }
