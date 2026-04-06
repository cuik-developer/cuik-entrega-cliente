import { db, sql } from "@cuik/db"
import type { SegmentationThresholds } from "./client-segments"
import { DEFAULT_THRESHOLDS } from "./client-segments"

export type AtRiskClient = {
  id: string
  name: string
  lastName: string | null
  lastVisitAt: Date | null
  avgDays: number
  daysSinceLastVisit: number
}

/**
 * Identifies at-risk clients for a tenant using SQL window functions.
 *
 * A client is "at risk" when:
 * - They have 3+ visits
 * - Their avg interval between visits is < frequentMaxDays (was "frecuente")
 * - They haven't visited in riskMultiplier * their average interval
 *
 * Reuses the same logic as `computeClientSegment` but via efficient SQL.
 * Accepts optional thresholds for per-tenant/business-type configuration.
 */
export async function getAtRiskClients(
  tenantId: string,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
): Promise<AtRiskClient[]> {
  // Single query: compute avg days between visits and days since last visit
  // using window functions for efficiency
  const rows = await db.execute<{
    id: string
    name: string
    last_name: string | null
    total_visits: number
    last_visit_at: string | null
    avg_days: number | null
    days_since_last: number | null
  }>(sql`
    WITH client_visit_stats AS (
      SELECT
        c.id,
        c.name,
        c.last_name,
        c.total_visits,
        c.created_at AS client_created_at,
        MAX(v.created_at) AS last_visit_at,
        CASE
          WHEN COUNT(v.id) >= 2 THEN
            EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(v.id) - 1, 0)
          ELSE NULL
        END AS avg_days,
        CASE
          WHEN MAX(v.created_at) IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - MAX(v.created_at))) / 86400.0
          ELSE NULL
        END AS days_since_last
      FROM loyalty.clients c
      LEFT JOIN loyalty.visits v ON v.client_id = c.id AND v.tenant_id = c.tenant_id
      WHERE c.tenant_id = ${tenantId}
        AND c.status != 'blocked'
        AND c.total_visits >= 3
      GROUP BY c.id, c.name, c.last_name, c.total_visits, c.created_at
    )
    SELECT id, name, last_name, total_visits, last_visit_at, avg_days, days_since_last
    FROM client_visit_stats
    WHERE avg_days IS NOT NULL
      AND avg_days < ${thresholds.frequentMaxDays}
      AND days_since_last IS NOT NULL
      AND days_since_last >= avg_days * ${thresholds.riskMultiplier}
    ORDER BY days_since_last DESC
  `)

  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastName: row.last_name,
    lastVisitAt: row.last_visit_at ? new Date(row.last_visit_at) : null,
    avgDays: Math.round((row.avg_days ?? 0) * 10) / 10,
    daysSinceLastVisit: Math.round(row.days_since_last ?? 0),
  }))
}

/**
 * Returns just the count of at-risk clients (cheaper than full list).
 */
export async function getAtRiskClientCount(
  tenantId: string,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`
    WITH client_visit_stats AS (
      SELECT
        c.id,
        c.total_visits,
        CASE
          WHEN COUNT(v.id) >= 2 THEN
            EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(v.id) - 1, 0)
          ELSE NULL
        END AS avg_days,
        CASE
          WHEN MAX(v.created_at) IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - MAX(v.created_at))) / 86400.0
          ELSE NULL
        END AS days_since_last
      FROM loyalty.clients c
      LEFT JOIN loyalty.visits v ON v.client_id = c.id AND v.tenant_id = c.tenant_id
      WHERE c.tenant_id = ${tenantId}
        AND c.status != 'blocked'
        AND c.total_visits >= 3
      GROUP BY c.id, c.total_visits
    )
    SELECT COUNT(*)::int AS count
    FROM client_visit_stats
    WHERE avg_days IS NOT NULL
      AND avg_days < ${thresholds.frequentMaxDays}
      AND days_since_last IS NOT NULL
      AND days_since_last >= avg_days * ${thresholds.riskMultiplier}
  `)

  return result.rows[0]?.count ?? 0
}
