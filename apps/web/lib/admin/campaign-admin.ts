import {
  campaignSegments,
  campaigns,
  clients,
  db,
  desc,
  eq,
  notifications,
  recurringCampaigns,
  sql,
  tenants,
} from "@cuik/db"
import {
  computeBatchEffectiveness,
  computeCampaignEffectiveness,
} from "@/lib/campaigns/campaign-effectiveness"
import { statsFor, toApi } from "@/lib/campaigns/recurring-api"
import { getInternalTenantIds } from "./internal-tenants"

/**
 * Super-admin view of campaigns: any tenant, read-only (plus retry and
 * pause/resume handled by the routes). Reuses the merchant computations
 * (effectiveness window of 24 h, recurring stats) so both panels agree.
 */

export type AdminCampaignRow = {
  id: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  name: string
  type: string
  status: string
  message: string | null
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
  targetCount: number
  sentCount: number
  skippedNoPass: number
  failedNotifications: number
  lastError: string | null
  lastErrorAt: string | null
  recurringId: string | null
  recurringName: string | null
  automation: string | null
  effectiveness: { conversions: number; conversionRate: number; totalSent: number } | null
}

export type AdminCampaignFilters = {
  /** One campaign only (detail). */
  id?: string
  tenantId?: string
  status?: "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed"
  /** YYYY-MM-DD inclusive, on sent_at (or scheduled_at / created_at when not sent). */
  from?: string
  to?: string
  search?: string
  includeInternal?: boolean
  page: number
  limit: number
}

const iso = (d: Date | string | null | undefined) =>
  d ? (d instanceof Date ? d : new Date(d)).toISOString() : null

/** `content->>'lastErrorAt'` as a UTC wall-time timestamp, only when it looks like an ISO date. */
const lastErrorAtTs = sql`CASE WHEN ${campaigns.content} ->> 'lastErrorAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
  THEN ((${campaigns.content} ->> 'lastErrorAt')::timestamptz AT TIME ZONE 'UTC') END`

/**
 * "Activity date" of a campaign as timestamptz: sent, else when it failed
 * (a draft with an error), else scheduled, else created. The columns hold UTC
 * wall time, hence the explicit AT TIME ZONE instead of the session zone.
 */
const activityAt = sql`(coalesce(${campaigns.sentAt},
  CASE WHEN ${campaigns.status} = 'draft' THEN ${lastErrorAtTs} END,
  ${campaigns.scheduledAt}, ${campaigns.createdAt}) AT TIME ZONE 'UTC')`

export async function listAdminCampaigns(
  f: AdminCampaignFilters,
): Promise<{ rows: AdminCampaignRow[]; total: number }> {
  const conds = [sql`1 = 1`]
  if (f.id) conds.push(sql`${campaigns.id} = ${f.id}::uuid`)
  if (f.tenantId) conds.push(sql`${campaigns.tenantId} = ${f.tenantId}::uuid`)
  if (f.status === "failed") {
    conds.push(
      sql`${campaigns.status} = 'draft' AND ${campaigns.content} ->> 'lastError' IS NOT NULL`,
    )
  } else if (f.status) {
    conds.push(sql`${campaigns.status} = ${f.status}`)
  }
  if (f.from) conds.push(sql`${activityAt} >= ${`${f.from}T00:00:00-05:00`}::timestamptz`)
  // The upper bound never hides what is still to be sent: a campaign scheduled
  // for next week belongs in the default "last 30 days" view.
  if (f.to) {
    conds.push(
      sql`(${activityAt} < (${`${f.to}T00:00:00-05:00`}::timestamptz + interval '1 day') OR ${campaigns.status} = 'scheduled')`,
    )
  }
  if (f.search?.trim()) {
    const pattern = `%${f.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    conds.push(sql`${campaigns.name} ILIKE ${pattern}`)
  }
  if (!f.includeInternal && !f.tenantId) {
    const internal = await getInternalTenantIds()
    if (internal.length) {
      conds.push(
        sql`${campaigns.tenantId} NOT IN (${sql.join(
          internal.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      )
    }
  }
  const where = sql.join(conds, sql` AND `)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(where)

  const rows = await db
    .select({
      id: campaigns.id,
      tenantId: campaigns.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
      message: campaigns.message,
      scheduledAt: campaigns.scheduledAt,
      sentAt: campaigns.sentAt,
      createdAt: campaigns.createdAt,
      targetCount: campaigns.targetCount,
      sentCount: campaigns.sentCount,
      skippedNoPass: sql<number>`coalesce((${campaigns.content} ->> 'skippedNoPass')::int, 0)`,
      lastError: sql<string | null>`${campaigns.content} ->> 'lastError'`,
      lastErrorAt: sql<string | null>`${campaigns.content} ->> 'lastErrorAt'`,
      automation: sql<string | null>`${campaigns.content} ->> 'automation'`,
      recurringId: campaigns.recurringId,
      recurringName: recurringCampaigns.name,
      failedNotifications: sql<number>`(SELECT count(*)::int FROM campaigns.notifications n WHERE n.campaign_id = ${campaigns.id} AND n.status = 'failed')`,
    })
    .from(campaigns)
    .innerJoin(tenants, eq(tenants.id, campaigns.tenantId))
    .leftJoin(recurringCampaigns, eq(recurringCampaigns.id, campaigns.recurringId))
    .where(where)
    .orderBy(desc(activityAt))
    .limit(f.limit)
    .offset((f.page - 1) * f.limit)

  // Effectiveness (visits within 24 h) for campaigns sent in the last 30 days.
  const cutoff = Date.now() - 30 * 86_400_000
  const recent = rows
    .filter((r) => r.status === "sent" && r.sentAt && new Date(r.sentAt).getTime() >= cutoff)
    .map((r) => r.id)
  const eff = recent.length ? await computeBatchEffectiveness(recent) : new Map()

  return {
    total: Number(total),
    rows: rows.map((r) => {
      const e = eff.get(r.id)
      // A stale lastError on a campaign that later went out is not a failure.
      const lastError = r.status === "draft" ? r.lastError : null
      return {
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        tenantSlug: r.tenantSlug,
        name: r.name,
        type: r.type,
        status: r.status,
        message: r.message,
        scheduledAt: iso(r.scheduledAt),
        sentAt: iso(r.sentAt),
        createdAt: iso(r.createdAt) ?? new Date().toISOString(),
        targetCount: r.targetCount,
        sentCount: r.sentCount,
        skippedNoPass: Number(r.skippedNoPass ?? 0),
        failedNotifications: Number(r.failedNotifications ?? 0),
        lastError,
        lastErrorAt: lastError ? r.lastErrorAt : null,
        recurringId: r.recurringId,
        recurringName: r.recurringName,
        automation: r.automation,
        effectiveness: e
          ? { conversions: e.conversions, conversionRate: e.conversionRate, totalSent: e.totalSent }
          : null,
      }
    }),
  }
}

export type AdminCampaignStats = {
  sent30d: number
  reached30d: number
  responded30d: number
  failed30d: number
  recurringActive: number
}

/** Figures for the strip of one tenant (last 30 days). */
export async function adminCampaignStats(tenantId: string): Promise<AdminCampaignStats> {
  const res = await db.execute<{
    sent30d: number
    reached30d: number
    failed30d: number
    recurring_active: number
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM campaigns.campaigns c WHERE c.tenant_id = ${tenantId}::uuid
         AND c.status = 'sent' AND c.sent_at >= now() - interval '30 days') AS sent30d,
      (SELECT coalesce(sum(c.sent_count), 0)::int FROM campaigns.campaigns c WHERE c.tenant_id = ${tenantId}::uuid
         AND c.status = 'sent' AND c.sent_at >= now() - interval '30 days') AS reached30d,
      (SELECT count(*)::int FROM campaigns.campaigns c WHERE c.tenant_id = ${tenantId}::uuid
         AND c.status = 'draft' AND c.content ->> 'lastErrorAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
         AND (c.content ->> 'lastErrorAt')::timestamptz >= now() - interval '30 days') AS failed30d,
      (SELECT count(*)::int FROM campaigns.recurring_campaigns r WHERE r.tenant_id = ${tenantId}::uuid
         AND r.status = 'active') AS recurring_active`)
  const k = res.rows[0]
  const sentIds = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      sql`${campaigns.tenantId} = ${tenantId}::uuid AND ${campaigns.status} = 'sent' AND ${campaigns.sentAt} >= now() - interval '30 days'`,
    )
  const eff = sentIds.length ? await computeBatchEffectiveness(sentIds.map((r) => r.id)) : new Map()
  let responded = 0
  for (const e of eff.values()) responded += e.conversions
  return {
    sent30d: Number(k?.sent30d ?? 0),
    reached30d: Number(k?.reached30d ?? 0),
    responded30d: responded,
    failed30d: Number(k?.failed30d ?? 0),
    recurringActive: Number(k?.recurring_active ?? 0),
  }
}

/** Recurring templates of a tenant, in the same shape the merchant panel uses. */
export async function listAdminRecurring(tenantId: string, timezone: string) {
  const rows = await db
    .select()
    .from(recurringCampaigns)
    .where(eq(recurringCampaigns.tenantId, tenantId))
    .orderBy(desc(recurringCampaigns.createdAt))
  const stats = await statsFor(rows.map((r) => r.id))
  return rows.map((r) => toApi(r, timezone, stats.get(r.id)))
}

export type AdminCampaignDetail = AdminCampaignRow & {
  segment: { segmentName: string | null; filter: unknown } | null
  byChannel: { channel: string; sent: number; delivered: number; failed: number }[]
  failures: {
    clientId: string
    clientName: string
    channel: string
    error: string | null
    sentAt: string | null
  }[]
  content: Record<string, unknown> | null
}

export async function adminCampaignDetail(campaignId: string): Promise<AdminCampaignDetail | null> {
  const { rows } = await listAdminCampaigns({ id: campaignId, includeInternal: true, page: 1, limit: 1 })
  const row = rows[0]
  if (!row) return null
  const [segment] = await db
    .select({ segmentName: campaignSegments.segmentName, filter: campaignSegments.filter })
    .from(campaignSegments)
    .where(eq(campaignSegments.campaignId, campaignId))
    .limit(1)
  const byChannel = await db.execute<{
    channel: string
    sent: number
    delivered: number
    failed: number
  }>(sql`
    SELECT channel,
           count(*) FILTER (WHERE status = 'sent')::int AS sent,
           count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
           count(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM campaigns.notifications WHERE campaign_id = ${campaignId}::uuid GROUP BY channel ORDER BY channel`)
  const failures = await db
    .select({
      clientId: notifications.clientId,
      name: clients.name,
      lastName: clients.lastName,
      channel: notifications.channel,
      error: notifications.error,
      sentAt: notifications.sentAt,
    })
    .from(notifications)
    .innerJoin(clients, eq(clients.id, notifications.clientId))
    .where(
      sql`${notifications.campaignId} = ${campaignId}::uuid AND ${notifications.status} = 'failed'`,
    )
    .orderBy(desc(notifications.sentAt))
    .limit(200)
  const [full] = await db
    .select({ content: campaigns.content })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)
  // Fresh single-campaign effectiveness (the list only computes it for the last 30 days).
  const eff = row.status === "sent" ? await computeCampaignEffectiveness(campaignId) : null
  return {
    ...row,
    effectiveness: eff
      ? {
          conversions: eff.conversions,
          conversionRate: eff.conversionRate,
          totalSent: eff.totalSent,
        }
      : row.effectiveness,
    segment: segment ?? null,
    byChannel: byChannel.rows.map((r) => ({
      channel: r.channel,
      sent: Number(r.sent),
      delivered: Number(r.delivered),
      failed: Number(r.failed),
    })),
    failures: failures.map((f) => ({
      clientId: f.clientId,
      clientName: [f.name, f.lastName].filter(Boolean).join(" ") || "Cliente",
      channel: f.channel,
      error: f.error,
      sentAt: iso(f.sentAt),
    })),
    content: (full?.content as Record<string, unknown> | null) ?? null,
  }
}
