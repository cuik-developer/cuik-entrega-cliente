import { and, campaigns, db, eq, gte, notifications, sql, visits } from "@cuik/db"

export interface CampaignEffectiveness {
  campaignId: string
  totalSent: number
  conversions: number
  conversionRate: number
  windowHours: number
}

/**
 * Computes effectiveness for a single campaign by cross-referencing
 * notification recipients with visits within the conversion window.
 */
export async function computeCampaignEffectiveness(
  campaignId: string,
  windowHours = 24,
): Promise<CampaignEffectiveness | null> {
  // Get campaign sentAt
  const [campaign] = await db
    .select({ sentAt: campaigns.sentAt, sentCount: campaigns.sentCount })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  if (!campaign?.sentAt) return null

  const windowEnd = new Date(campaign.sentAt.getTime() + windowHours * 60 * 60 * 1000)

  // Count distinct clients who received the notification and visited within the window
  const [result] = await db
    .select({
      totalSent: sql<number>`count(distinct ${notifications.clientId})::int`,
      conversions: sql<number>`count(distinct case
        when ${visits.id} is not null then ${notifications.clientId}
      end)::int`,
    })
    .from(notifications)
    .leftJoin(
      visits,
      and(
        eq(visits.clientId, notifications.clientId),
        gte(visits.createdAt, campaign.sentAt),
        sql`${visits.createdAt} <= ${windowEnd}`,
      ),
    )
    .where(eq(notifications.campaignId, campaignId))

  const totalSent = result?.totalSent ?? 0
  const conversions = result?.conversions ?? 0
  const conversionRate = totalSent > 0 ? Math.round((conversions / totalSent) * 10000) / 100 : 0

  return {
    campaignId,
    totalSent,
    conversions,
    conversionRate,
    windowHours,
  }
}

/**
 * Batch-computes effectiveness for multiple campaigns in a single query.
 * Only processes campaigns that have been sent (have a sentAt timestamp).
 */
export async function computeBatchEffectiveness(
  campaignIds: string[],
  windowHours = 24,
): Promise<Map<string, CampaignEffectiveness>> {
  if (campaignIds.length === 0) return new Map()

  // Get sentAt for all campaigns
  const campaignRows = await db
    .select({
      id: campaigns.id,
      sentAt: campaigns.sentAt,
    })
    .from(campaigns)
    .where(
      sql`${campaigns.id} IN (${sql.join(
        campaignIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )

  const sentCampaigns = campaignRows.filter((c) => c.sentAt !== null)
  if (sentCampaigns.length === 0) return new Map()

  // Build a single query that computes conversions for all campaigns at once
  // For each campaign, we need its own window, so we join with a subquery
  const results = await db
    .select({
      campaignId: notifications.campaignId,
      totalSent: sql<number>`count(distinct ${notifications.clientId})::int`,
      conversions: sql<number>`count(distinct case
        when ${visits.id} is not null then ${notifications.clientId}
      end)::int`,
    })
    .from(notifications)
    .innerJoin(campaigns, eq(campaigns.id, notifications.campaignId))
    .leftJoin(
      visits,
      and(
        eq(visits.clientId, notifications.clientId),
        gte(visits.createdAt, campaigns.sentAt),
        sql`${visits.createdAt} <= ${campaigns.sentAt} + interval '${sql.raw(String(windowHours))} hours'`,
      ),
    )
    .where(
      sql`${notifications.campaignId} IN (${sql.join(
        sentCampaigns.map((c) => sql`${c.id}::uuid`),
        sql`, `,
      )})`,
    )
    .groupBy(notifications.campaignId)

  const map = new Map<string, CampaignEffectiveness>()
  for (const row of results) {
    const totalSent = row.totalSent ?? 0
    const conversions = row.conversions ?? 0
    const conversionRate = totalSent > 0 ? Math.round((conversions / totalSent) * 10000) / 100 : 0

    map.set(row.campaignId, {
      campaignId: row.campaignId,
      totalSent,
      conversions,
      conversionRate,
      windowHours,
    })
  }

  return map
}
