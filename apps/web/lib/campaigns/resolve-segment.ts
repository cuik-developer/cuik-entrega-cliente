import { and, clients, db, eq, ne, sql } from "@cuik/db"
import type { SegmentFilter } from "@cuik/shared/types/campaign"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { DEFAULT_THRESHOLDS } from "@/lib/loyalty/client-segments"

/**
 * Resolves a segment filter to a list of client IDs for a given tenant.
 * Handles both preset expansion and custom conditions.
 * Always excludes blocked clients.
 * Accepts optional thresholds for per-tenant/business-type configuration.
 */
export async function resolveSegment(
  tenantId: string,
  filter: SegmentFilter,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
): Promise<{ clientIds: string[]; count: number }> {
  const conditions = buildWhereConditions(tenantId, filter, thresholds)

  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(...conditions))

  const clientIds = rows.map((r) => r.id)
  return { clientIds, count: clientIds.length }
}

/**
 * Counts the number of clients matching a segment filter without fetching IDs.
 * Used for campaign preview.
 */
export async function countSegment(
  tenantId: string,
  filter: SegmentFilter,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
): Promise<number> {
  const conditions = buildWhereConditions(tenantId, filter, thresholds)

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clients)
    .where(and(...conditions))

  return result[0]?.count ?? 0
}

/**
 * Builds an array of Drizzle SQL conditions from a SegmentFilter.
 * Always includes tenantId match and excludes blocked clients.
 */
function buildWhereConditions(
  tenantId: string,
  filter: SegmentFilter,
  thresholds: SegmentationThresholds,
) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(clients.tenantId, tenantId),
    ne(clients.status, "blocked"),
  ]

  // Expand preset into conditions
  if (filter.preset) {
    switch (filter.preset) {
      case "todos":
        // No additional conditions — all non-blocked clients
        break

      case "activos":
        // Has visited within oneTimeInactiveDays
        conditions.push(eq(clients.status, "active"))
        conditions.push(
          sql`${clients.id} IN (
            SELECT DISTINCT "client_id" FROM loyalty.visits
            WHERE "tenant_id" = ${tenantId}
              AND "created_at" >= NOW() - INTERVAL '1 day' * ${thresholds.oneTimeInactiveDays}
          )`,
        )
        break

      case "inactivos":
        // No visit in oneTimeInactiveDays
        conditions.push(eq(clients.status, "active"))
        conditions.push(
          sql`${clients.id} NOT IN (
            SELECT DISTINCT "client_id" FROM loyalty.visits
            WHERE "tenant_id" = ${tenantId}
              AND "created_at" >= NOW() - INTERVAL '1 day' * ${thresholds.oneTimeInactiveDays}
          )`,
        )
        break

      case "vip":
        conditions.push(sql`${clients.tier} = 'VIP'`)
        break

      case "nuevos":
        conditions.push(sql`${clients.totalVisits} <= 3`)
        conditions.push(
          sql`${clients.createdAt} >= NOW() - INTERVAL '1 day' * ${thresholds.newClientDays * 2}`,
        )
        break

      case "frecuentes":
        // 3+ visits AND avg days between visits < frequentMaxDays AND not at risk
        conditions.push(sql`${clients.totalVisits} >= 3`)
        conditions.push(
          sql`${clients.id} IN (
            SELECT cs.id FROM (
              SELECT
                c.id,
                EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(v.id) - 1, 0) AS avg_days,
                EXTRACT(EPOCH FROM (NOW() - MAX(v.created_at))) / 86400.0 AS days_since_last
              FROM loyalty.clients c
              JOIN loyalty.visits v ON v.client_id = c.id AND v.tenant_id = c.tenant_id
              WHERE c.tenant_id = ${tenantId}
                AND c.status != 'blocked'
                AND c.total_visits >= 3
              GROUP BY c.id
              HAVING COUNT(v.id) >= 2
            ) cs
            WHERE cs.avg_days < ${thresholds.frequentMaxDays}
              AND cs.days_since_last < cs.avg_days * ${thresholds.riskMultiplier}
          )`,
        )
        break

      case "esporadicos":
        // 3+ visits AND avg days between visits >= frequentMaxDays
        conditions.push(sql`${clients.totalVisits} >= 3`)
        conditions.push(
          sql`${clients.id} IN (
            SELECT cs.id FROM (
              SELECT
                c.id,
                EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(v.id) - 1, 0) AS avg_days
              FROM loyalty.clients c
              JOIN loyalty.visits v ON v.client_id = c.id AND v.tenant_id = c.tenant_id
              WHERE c.tenant_id = ${tenantId}
                AND c.status != 'blocked'
                AND c.total_visits >= 3
              GROUP BY c.id
              HAVING COUNT(v.id) >= 2
            ) cs
            WHERE cs.avg_days >= ${thresholds.frequentMaxDays}
          )`,
        )
        break

      case "one_time":
        // Exactly 1 visit AND last visit oneTimeInactiveDays+ ago
        conditions.push(sql`${clients.totalVisits} = 1`)
        conditions.push(
          sql`(
            SELECT MAX("created_at") FROM loyalty.visits
            WHERE "client_id" = ${clients.id}
              AND "tenant_id" = ${tenantId}
          ) <= NOW() - INTERVAL '1 day' * ${thresholds.oneTimeInactiveDays}`,
        )
        break

      case "en_riesgo":
        // Clients with 3+ visits, avg interval < frequentMaxDays, but absent riskMultiplier * avg
        conditions.push(sql`${clients.totalVisits} >= 3`)
        conditions.push(
          sql`${clients.id} IN (
            SELECT cs.id FROM (
              SELECT
                c.id,
                EXTRACT(EPOCH FROM (MAX(v.created_at) - MIN(v.created_at))) / 86400.0 / NULLIF(COUNT(v.id) - 1, 0) AS avg_days,
                EXTRACT(EPOCH FROM (NOW() - MAX(v.created_at))) / 86400.0 AS days_since_last
              FROM loyalty.clients c
              JOIN loyalty.visits v ON v.client_id = c.id AND v.tenant_id = c.tenant_id
              WHERE c.tenant_id = ${tenantId}
                AND c.status != 'blocked'
                AND c.total_visits >= 3
              GROUP BY c.id
              HAVING COUNT(v.id) >= 2
            ) cs
            WHERE cs.avg_days < ${thresholds.frequentMaxDays}
              AND cs.days_since_last >= cs.avg_days * ${thresholds.riskMultiplier}
          )`,
        )
        break
    }
  }

  // Apply custom conditions
  if (filter.conditions) {
    for (const cond of filter.conditions) {
      switch (cond.field) {
        case "totalVisits":
          conditions.push(
            applyNumericCondition(clients.totalVisits, cond.operator, cond.value, cond.valueTo),
          )
          break

        case "lastVisitAt":
          // Subquery to get last visit date per client
          conditions.push(
            applyDateSubqueryCondition(
              tenantId,
              cond.operator,
              String(cond.value),
              cond.valueTo ? String(cond.valueTo) : undefined,
            ),
          )
          break

        case "tier":
          conditions.push(sql`${clients.tier} = ${String(cond.value)}`)
          break

        case "createdAt":
          conditions.push(
            applyDateCondition(
              clients.createdAt,
              cond.operator,
              String(cond.value),
              cond.valueTo ? String(cond.valueTo) : undefined,
            ),
          )
          break

        case "status":
          conditions.push(sql`${clients.status} = ${String(cond.value)}`)
          break
      }
    }
  }

  // Filter by tags using EXISTS subquery
  if (filter.tagIds && filter.tagIds.length > 0) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM loyalty.client_tag_assignments
        WHERE "client_id" = ${clients.id}
          AND "tag_id" IN (${sql.join(
            filter.tagIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
      )`,
    )
  }

  return conditions
}

function applyNumericCondition(
  column: typeof clients.totalVisits,
  operator: string,
  value: string | number,
  valueTo?: string | number,
) {
  const numValue = Number(value)
  switch (operator) {
    case "eq":
      return sql`${column} = ${numValue}`
    case "gte":
      return sql`${column} >= ${numValue}`
    case "lte":
      return sql`${column} <= ${numValue}`
    case "between":
      return sql`${column} BETWEEN ${numValue} AND ${Number(valueTo)}`
    default:
      return sql`TRUE`
  }
}

function applyDateCondition(
  column: typeof clients.createdAt,
  operator: string,
  value: string,
  valueTo?: string,
) {
  switch (operator) {
    case "eq":
      return sql`${column}::date = ${value}::date`
    case "gte":
      return sql`${column} >= ${value}::date`
    case "lte":
      return sql`${column} < (${value}::date + INTERVAL '1 day')`
    case "between":
      return sql`${column} >= ${value}::date AND ${column} < (${valueTo}::date + INTERVAL '1 day')`
    default:
      return sql`TRUE`
  }
}

function applyDateSubqueryCondition(
  tenantId: string,
  operator: string,
  value: string,
  valueTo?: string,
) {
  const subquery = sql`(
    SELECT MAX("created_at") FROM loyalty.visits
    WHERE "client_id" = ${clients.id}
      AND "tenant_id" = ${tenantId}
  )`

  switch (operator) {
    case "eq":
      return sql`${subquery}::date = ${value}::date`
    case "gte":
      return sql`${subquery} >= ${value}::date`
    case "lte":
      return sql`${subquery} < (${value}::date + INTERVAL '1 day')`
    case "between":
      return sql`${subquery} >= ${value}::date AND ${subquery} < (${valueTo}::date + INTERVAL '1 day')`
    default:
      return sql`TRUE`
  }
}
