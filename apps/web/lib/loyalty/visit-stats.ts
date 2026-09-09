import { db, eq, sql, visits } from "@cuik/db"

/**
 * Per-client visit aggregates (last visit, average days between visits) as a
 * Drizzle subquery meant to be LEFT JOINed onto `clients`:
 *
 *   const vs = visitStatsSubquery(tenant.id)
 *   db.select({ ..., lastVisitAt: vs.lastVisitAt }).from(clients).leftJoin(vs, eq(vs.clientId, clients.id))
 *
 * Why a join and not a correlated `(SELECT ... WHERE client_id = ${clients.id})`
 * in the select list: for a single-table query Drizzle strips the table qualifier
 * from every column it finds inside the select list, so `${clients.id}` renders as
 * a bare `"id"` — which, inside the subquery, resolves against `visits.id` and
 * never matches. The stats silently come back NULL for every client and the
 * segment engine falls through to its default. With a join Drizzle keeps the
 * qualified names. See visit-stats.test.ts for the regression check.
 *
 * Both fields are raw driver values: `lastVisitAt` is a timestamp that node-pg
 * hands back as a string (Drizzle only maps real table columns to Date), and
 * `avgDaysBetweenVisits` is a PG numeric string, NULL under two visits. Run them
 * through parseVisitDate / parseAvgDays before touching them.
 */
export function visitStatsSubquery(tenantId: string) {
  return db
    .select({
      clientId: visits.clientId,
      lastVisitAt: sql<Date | string | null>`MAX(${visits.createdAt})`.as("last_visit_at"),
      avgDaysBetweenVisits: sql<string | null>`
        CASE
          WHEN COUNT(*) <= 1 THEN NULL
          ELSE EXTRACT(EPOCH FROM (MAX(${visits.createdAt}) - MIN(${visits.createdAt})))
            / (COUNT(*) - 1) / 86400.0
        END`.as("avg_days_between_visits"),
    })
    .from(visits)
    .where(eq(visits.tenantId, tenantId))
    .groupBy(visits.clientId)
    .as("visit_stats")
}

/** Timestamps from the subquery arrive as strings (UTC, no offset) — never call .getTime() on them raw. */
export function parseVisitDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  // node-pg formats `timestamp` without a zone; the DB stores UTC.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Normalises the numeric-as-string that PG returns for the average. */
export function parseAvgDays(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
