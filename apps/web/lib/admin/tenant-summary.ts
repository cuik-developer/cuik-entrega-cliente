import { db, sql } from "@cuik/db"

/**
 * Counts and health signals the super-admin shows next to a tenant (list and
 * detail page). One batched query per metric for any number of tenants.
 */

export type TenantHealthSummary = {
  lastVisitAt: string | null
  visits30d: number
  newClients30d: number
  installed: number
}

export type TenantSummary = {
  clientCount: number
  visitCount: number
  rewardCount: number
  returnRate: number
  planName: string | null
  health: TenantHealthSummary
}

export async function enrichTenantRows<T extends { id: string; planId: string | null }>(
  tenantRows: T[],
): Promise<Array<T & TenantSummary>> {
  if (tenantRows.length === 0) return []
  const tenantIdList = sql.join(
    tenantRows.map((t) => sql`${t.id}::uuid`),
    sql`, `,
  )

  const [clientCounts, visitCounts, rewardCounts, returnRates, health, planNames] =
    await Promise.all([
      db.execute<{ tenant_id: string; cnt: number }>(
        sql`SELECT tenant_id, count(*)::int AS cnt FROM loyalty.clients WHERE tenant_id IN (${tenantIdList}) GROUP BY tenant_id`,
      ),
      db.execute<{ tenant_id: string; cnt: number }>(
        sql`SELECT tenant_id, count(*)::int AS cnt FROM loyalty.visits WHERE tenant_id IN (${tenantIdList}) GROUP BY tenant_id`,
      ),
      db.execute<{ tenant_id: string; cnt: number }>(
        sql`SELECT tenant_id, count(*)::int AS cnt FROM loyalty.rewards WHERE tenant_id IN (${tenantIdList}) AND status = 'redeemed' GROUP BY tenant_id`,
      ),
      db.execute<{ tenant_id: string; return_rate: number }>(
        sql`SELECT tenant_id, CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE total_visits > 1) / count(*))::int END AS return_rate FROM loyalty.clients WHERE tenant_id IN (${tenantIdList}) GROUP BY tenant_id`,
      ),
      // Health signals (bonus rows are not visits): last visit, activity in
      // the last 30 days and how many clients actually installed a pass
      // (Apple = device registered, Google = save link not reported removed).
      db.execute<{
        tenant_id: string
        last_visit_at: Date | string | null
        visits_30d: number
        new_clients_30d: number
        installed: number
      }>(
        sql`SELECT t.id AS tenant_id,
            (SELECT MAX(v.created_at) FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus') AS last_visit_at,
            (SELECT count(*)::int FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus' AND v.created_at >= now() - interval '30 days') AS visits_30d,
            (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND c.created_at >= now() - interval '30 days') AS new_clients_30d,
            (SELECT count(DISTINCT pi.client_id)::int
               FROM passes.pass_instances pi
               LEFT JOIN passes.apple_devices ad ON ad.serial_number = pi.serial_number
               JOIN loyalty.clients c ON c.id = pi.client_id
              WHERE c.tenant_id = t.id
                AND (ad.serial_number IS NOT NULL OR (pi.google_save_url IS NOT NULL AND pi.google_save_url <> '' AND NOT (pi.google_deleted_at IS NOT NULL AND (pi.google_saved_at IS NULL OR pi.google_deleted_at > pi.google_saved_at))))) AS installed
          FROM tenants t WHERE t.id IN (${tenantIdList})`,
      ),
      (() => {
        const planIds = [...new Set(tenantRows.map((t) => t.planId).filter(Boolean))] as string[]
        if (planIds.length === 0) return { rows: [] as { id: string; name: string }[] }
        return db.execute<{ id: string; name: string }>(
          sql`SELECT id, name FROM plans WHERE id IN (${sql.join(
            planIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        )
      })(),
    ])

  const clientCountMap = new Map(clientCounts.rows.map((r) => [r.tenant_id, Number(r.cnt)]))
  const visitCountMap = new Map(visitCounts.rows.map((r) => [r.tenant_id, Number(r.cnt)]))
  const rewardCountMap = new Map(rewardCounts.rows.map((r) => [r.tenant_id, Number(r.cnt)]))
  const returnRateMap = new Map(returnRates.rows.map((r) => [r.tenant_id, Number(r.return_rate)]))
  const planNameMap = new Map(planNames.rows.map((r) => [r.id, r.name]))
  const healthMap = new Map<string, TenantHealthSummary>(
    health.rows.map((r) => [
      r.tenant_id,
      {
        lastVisitAt: r.last_visit_at ? new Date(r.last_visit_at).toISOString() : null,
        visits30d: Number(r.visits_30d),
        newClients30d: Number(r.new_clients_30d),
        installed: Number(r.installed),
      },
    ]),
  )

  return tenantRows.map((t) => ({
    ...t,
    clientCount: clientCountMap.get(t.id) ?? 0,
    visitCount: visitCountMap.get(t.id) ?? 0,
    rewardCount: rewardCountMap.get(t.id) ?? 0,
    returnRate: returnRateMap.get(t.id) ?? 0,
    planName: t.planId ? (planNameMap.get(t.planId) ?? null) : null,
    health: healthMap.get(t.id) ?? {
      lastVisitAt: null,
      visits30d: 0,
      newClients30d: 0,
      installed: 0,
    },
  }))
}

/** Columns the super-admin tenant views need; shared by the list and the detail GET. */
export const TENANT_LIST_COLUMNS = {
  id: true,
  slug: true,
  name: true,
  status: true,
  planId: true,
  trialEndsAt: true,
  activatedAt: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  branding: true,
  businessType: true,
  address: true,
  phone: true,
  contactEmail: true,
  timezone: true,
  segmentationConfig: true,
  appleConfig: true,
} as const
