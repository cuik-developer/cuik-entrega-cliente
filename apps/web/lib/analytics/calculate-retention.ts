import { db, eq, retentionCohorts, sql, tenants } from "@cuik/db"
import { tenantTzLiteral } from "./tenant-tz"

/**
 * Calculates retention cohorts for a tenant and upserts them into
 * analytics.retention_cohorts (read by GET /api/[tenant]/analytics/retention).
 *
 * A cohort is the set of clients that REGISTERED in the same month
 * (clients.created_at, not first visit). For each cohort and each month offset
 * (0 = registration month, 1 = the month after, …) the row stores how many of
 * those clients had at least one visit in that month and the percentage over
 * the cohort size. Months are not cumulative: a client seen in M1 and M3 but
 * not M2 counts in M1 and M3 only.
 *
 * Every month boundary is evaluated in the tenant's timezone — a visit at
 * 23:00 on May 31 in Lima belongs to May, not June. Blocked clients are
 * excluded everywhere.
 *
 * @param opts.month - Optional: only recalculate this cohort month ("YYYY-MM-01")
 */
export async function calculateRetentionCohorts(tenantId: string, opts?: { month?: string }) {
  const tenantRows = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tzLit = tenantTzLiteral(tenantRows[0]?.timezone)

  // Month bucket ("YYYY-MM-01") of a UTC timestamp column, in the tenant's tz.
  const clientMonth = sql`to_char(c."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit}, 'YYYY-MM-01')`
  const visitMonth = sql`to_char(v."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit}, 'YYYY-MM-01')`

  const cohortFilter = opts?.month ? sql`AND ${clientMonth} = ${opts.month}` : sql``

  // Step 1: cohort sizes + the current month, all in tenant time.
  const cohorts = await db.execute(
    sql`
      SELECT
        ${clientMonth} AS "cohortMonth",
        COUNT(DISTINCT c."id")::int AS "totalClients",
        to_char(NOW() AT TIME ZONE ${tzLit}, 'YYYY-MM-01') AS "currentMonth"
      FROM loyalty.clients c
      WHERE c."tenant_id" = ${tenantId}
        AND c."status" != 'blocked'
        ${cohortFilter}
      GROUP BY ${clientMonth}
      ORDER BY "cohortMonth"
    `,
  )

  const cohortRows = cohorts.rows as Array<{
    cohortMonth: string
    totalClients: number
    currentMonth: string
  }>
  if (cohortRows.length === 0) return

  // Step 2: one query for every (cohort, month) pair with at least one visit.
  const returned = await db.execute(
    sql`
      SELECT
        ${clientMonth} AS "cohortMonth",
        ${visitMonth} AS "visitMonth",
        COUNT(DISTINCT v."client_id")::int AS "returnedClients"
      FROM loyalty.visits v
      INNER JOIN loyalty.clients c ON c."id" = v."client_id"
      WHERE c."tenant_id" = ${tenantId}
        AND v."tenant_id" = ${tenantId}
        AND c."status" != 'blocked'
        ${cohortFilter}
      GROUP BY ${clientMonth}, ${visitMonth}
    `,
  )
  const returnedMap = new Map<string, number>()
  for (const row of returned.rows as Array<{
    cohortMonth: string
    visitMonth: string
    returnedClients: number
  }>) {
    returnedMap.set(`${row.cohortMonth}|${row.visitMonth}`, row.returnedClients)
  }

  // Step 3: upsert every offset from the cohort month up to the current month.
  const currentMonth = cohortRows[0].currentMonth
  for (const cohort of cohortRows) {
    const maxOffset = monthsBetween(cohort.cohortMonth, currentMonth)
    if (maxOffset < 0) continue

    for (let offset = 0; offset <= maxOffset; offset++) {
      const targetMonth = addMonths(cohort.cohortMonth, offset)
      const returnedClients = returnedMap.get(`${cohort.cohortMonth}|${targetMonth}`) ?? 0
      const retentionPct =
        cohort.totalClients > 0
          ? Number(((returnedClients / cohort.totalClients) * 100).toFixed(2))
          : 0

      await db
        .insert(retentionCohorts)
        .values({
          tenantId,
          cohortMonth: cohort.cohortMonth,
          monthOffset: offset,
          clientsCount: returnedClients,
          retentionPct: String(retentionPct),
        })
        .onConflictDoUpdate({
          target: [
            retentionCohorts.tenantId,
            retentionCohorts.cohortMonth,
            retentionCohorts.monthOffset,
          ],
          set: {
            clientsCount: returnedClients,
            retentionPct: String(retentionPct),
          },
        })
    }
  }
}

/** "YYYY-MM-01" strings only — no Date objects, so no timezone can leak in. */
export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split("-").map(Number)
  const [ty, tm] = toMonth.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export function addMonths(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number)
  const total = y * 12 + (m - 1) + offset
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}-01`
}
