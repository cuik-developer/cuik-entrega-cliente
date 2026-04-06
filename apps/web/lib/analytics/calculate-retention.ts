import { db, retentionCohorts, sql } from "@cuik/db"

/**
 * Calculates retention cohorts for a tenant.
 * Groups clients by the month of their first visit (cohort_month).
 * For each cohort, calculates how many returned in subsequent months.
 * Upserts results into analytics.retention_cohorts.
 *
 * @param tenantId - The tenant to calculate retention for
 * @param opts.month - Optional: only calculate for this specific cohort month (YYYY-MM-DD format, first of month)
 */
export async function calculateRetentionCohorts(tenantId: string, opts?: { month?: string }) {
  // Step 1: Find all cohort months (month of each client's first visit)
  // A cohort is defined by the month of the client's createdAt (registration date)
  const cohortFilter = opts?.month
    ? sql`AND to_char(c."created_at", 'YYYY-MM-01') = ${opts.month}`
    : sql``

  const cohorts = await db.execute(
    sql`
      SELECT
        to_char(c."created_at", 'YYYY-MM-01') AS "cohortMonth",
        COUNT(DISTINCT c."id")::int AS "totalClients"
      FROM loyalty.clients c
      WHERE c."tenant_id" = ${tenantId}
        AND c."status" != 'blocked'
        ${cohortFilter}
      GROUP BY to_char(c."created_at", 'YYYY-MM-01')
      ORDER BY "cohortMonth"
    `,
  )

  const cohortRows = cohorts.rows as Array<{ cohortMonth: string; totalClients: number }>
  if (cohortRows.length === 0) return

  // Step 2: For each cohort month, compute retention at each month offset
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  for (const cohort of cohortRows) {
    const cohortDate = new Date(cohort.cohortMonth)
    const currentDate = new Date(currentMonth)

    // Calculate how many months between cohort and current
    const maxOffset =
      (currentDate.getFullYear() - cohortDate.getFullYear()) * 12 +
      (currentDate.getMonth() - cohortDate.getMonth())

    // For each offset (0 = cohort month itself, 1 = next month, etc.)
    for (let offset = 0; offset <= maxOffset; offset++) {
      // Calculate the target month for this offset
      const targetDate = new Date(cohortDate)
      targetDate.setMonth(targetDate.getMonth() + offset)
      const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-01`

      // Count clients from this cohort who had at least one visit in the target month
      const retention = await db.execute(
        sql`
          SELECT COUNT(DISTINCT v."client_id")::int AS "returnedClients"
          FROM loyalty.visits v
          INNER JOIN loyalty.clients c ON c."id" = v."client_id"
          WHERE c."tenant_id" = ${tenantId}
            AND to_char(c."created_at", 'YYYY-MM-01') = ${cohort.cohortMonth}
            AND to_char(v."created_at", 'YYYY-MM-01') = ${targetMonth}
            AND c."status" != 'blocked'
        `,
      )

      const retentionRows = retention.rows as Array<{ returnedClients: number }>
      const returnedClients = retentionRows[0]?.returnedClients ?? 0
      const retentionPct =
        cohort.totalClients > 0
          ? Number(((returnedClients / cohort.totalClients) * 100).toFixed(2))
          : 0

      // Upsert into retention_cohorts
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
