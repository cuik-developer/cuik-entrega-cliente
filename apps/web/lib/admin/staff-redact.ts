import type { AdminCampaignDetail } from "@/lib/admin/campaign-admin"
import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

/**
 * What Equipo Cuik staff may see of super-admin data. Allow-lists, not
 * deny-lists: a field added later to the owner's responses stays hidden
 * from staff until it is added here on purpose.
 */

/** Tenant row for "tenants_view": identity, program health and aggregate counts only. */
export function toStaffTenantView<
  T extends {
    id: string
    slug: string
    name: string
    status: string
    planId: string | null
    planName: string | null
    trialEndsAt: Date | string | null
    activatedAt: Date | string | null
    createdAt: Date | string
    updatedAt: Date | string
    branding: unknown
    businessType: string | null
    timezone: string | null
    clientCount: number
    visitCount: number
    rewardCount: number
    returnRate: number
    health: unknown
  },
>(t: T) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    planId: t.planId,
    planName: t.planName,
    trialEndsAt: t.trialEndsAt,
    activatedAt: t.activatedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    branding: t.branding,
    businessType: t.businessType,
    timezone: t.timezone,
    clientCount: t.clientCount,
    visitCount: t.visitCount,
    rewardCount: t.rewardCount,
    returnRate: t.returnRate,
    health: t.health,
  }
}

export type StaffTenantView = ReturnType<typeof toStaffTenantView>

/**
 * Métricas for "metrics": aggregate figures stay, revenue does not (MRR,
 * plan prices and the revenue insight). `revenueHidden` tells the UI to drop
 * the MRR tile instead of showing S/ 0.
 */
export function redactMetricsForStaff(
  data: PlatformMetrics,
): PlatformMetrics & { revenueHidden: true } {
  return {
    ...data,
    kpis: { ...data.kpis, mrr: { cur: 0, prev: 0 } },
    insights: data.insights.filter((i) => !/ingreso|mrr|S\/\s/i.test(i.text)),
    tenants: data.tenants.map((t) => ({ ...t, planPrice: 0 })),
    revenueHidden: true,
  }
}

/** Shown to staff instead of the raw send error (it can name clients or carry provider internals). */
export const STAFF_CAMPAIGN_ERROR_TEXT = "Falló el envío (el detalle solo lo ve el propietario)"

/**
 * Campaign detail for "campaigns", as an allow-list: what staff need to read
 * the campaign and its message. Dropped: the per-client failure list (names
 * are personal data), the raw `content` JSON, the raw lastError text
 * (replaced by a generic text plus `hasError`, so the UI still marks the
 * campaign as failed) and the segment filter internals.
 */
export function redactCampaignDetailForStaff(detail: AdminCampaignDetail) {
  return {
    id: detail.id,
    tenantId: detail.tenantId,
    tenantName: detail.tenantName,
    tenantSlug: detail.tenantSlug,
    name: detail.name,
    type: detail.type,
    status: detail.status,
    message: detail.message,
    scheduledAt: detail.scheduledAt,
    sentAt: detail.sentAt,
    createdAt: detail.createdAt,
    targetCount: detail.targetCount,
    sentCount: detail.sentCount,
    skippedNoPass: detail.skippedNoPass,
    failedNotifications: detail.failedNotifications,
    hasError: Boolean(detail.lastError),
    lastError: detail.lastError ? STAFF_CAMPAIGN_ERROR_TEXT : null,
    lastErrorAt: detail.lastErrorAt,
    recurringId: detail.recurringId,
    recurringName: detail.recurringName,
    automation: detail.automation,
    effectiveness: detail.effectiveness,
    segment: detail.segment ? { segmentName: detail.segment.segmentName, filter: null } : null,
    byChannel: detail.byChannel.map((ch) => ({
      channel: ch.channel,
      sent: ch.sent,
      delivered: ch.delivered,
      failed: ch.failed,
    })),
    failures: [] as AdminCampaignDetail["failures"],
    failuresHidden: true as const,
    content: null,
  } satisfies AdminCampaignDetail & { hasError: boolean; failuresHidden: true }
}
