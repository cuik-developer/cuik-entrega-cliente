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

/** Campaign detail for "campaigns": no per-client failure list (names are personal data). */
export function redactCampaignDetailForStaff<T extends { failures: unknown[] }>(
  detail: T,
): T & { failuresHidden: true } {
  return { ...detail, failures: [], failuresHidden: true }
}
