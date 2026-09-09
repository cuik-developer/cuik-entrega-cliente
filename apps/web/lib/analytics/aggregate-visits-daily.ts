import { db, sql, visitsDaily } from "@cuik/db"
import { tenantTzLiteral } from "./tenant-tz"

/** Rows with no branch are stored under this sentinel (the PK needs a non-null location_id). */
export const NO_LOCATION_ID = "00000000-0000-0000-0000-000000000000"

/**
 * The tenant-local calendar days to (re)aggregate: yesterday and the `days - 1`
 * days before it, oldest first. "Today" is excluded because it is still being
 * written to. Re-aggregating a few days on every run is what makes a missed
 * night harmless — the next run fills the gap.
 */
export function daysToAggregate(todayLocal: string, days: number): string[] {
  const [y, m, d] = todayLocal.split("-").map(Number)
  const out: string[] = []
  for (let i = days; i >= 1; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i))
    out.push(dt.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Recomputes analytics.visits_daily for one tenant and one local day from the
 * source tables, per location. Every day boundary is evaluated in the tenant's
 * timezone. The upsert REPLACES the row: the live counters kept by
 * updateVisitsDaily during the day are superseded by the exact recount.
 *
 * Rewards: a redemption is attributed to the branch of a visit by the same
 * client on the same local day; without one it lands under NO_LOCATION_ID.
 */
export async function aggregateVisitsDaily(params: {
  tenantId: string
  timezone: string | null | undefined
  date: string
}): Promise<{ rows: number }> {
  const { tenantId, date } = params
  const tzLit = tenantTzLiteral(params.timezone)
  const localVisitDay = sql`(v."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})::date`
  const localClientDay = sql`(c."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})::date`
  const localRedeemDay = sql`(r."redeemed_at" AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})::date`
  // Inlined (constant, not user input): as a bound param Drizzle would number the
  // SELECT and GROUP BY occurrences differently ($1 vs $5) and PG rejects the
  // GROUP BY. Same reason tenantTzLiteral inlines the timezone.
  const locationExpr = sql.raw(`COALESCE(v."location_id", '${NO_LOCATION_ID}'::uuid)`)

  const visitAgg = await db.execute(
    sql`
      SELECT
        ${locationExpr} AS "locationId",
        COUNT(*)::int AS "totalVisits",
        COUNT(DISTINCT v."client_id")::int AS "uniqueClients",
        COUNT(DISTINCT v."client_id") FILTER (WHERE ${localClientDay} = ${date}::date)::int AS "newClients"
      FROM loyalty.visits v
      INNER JOIN loyalty.clients c ON c."id" = v."client_id"
      WHERE v."tenant_id" = ${tenantId}
        AND ${localVisitDay} = ${date}::date
      GROUP BY ${locationExpr}
    `,
  )

  const rewardAgg = await db.execute(
    sql`
      SELECT
        ${locationExpr} AS "locationId",
        COUNT(DISTINCT r."id")::int AS "rewardsRedeemed"
      FROM loyalty.rewards r
      LEFT JOIN LATERAL (
        SELECT v."location_id"
        FROM loyalty.visits v
        WHERE v."client_id" = r."client_id"
          AND v."tenant_id" = r."tenant_id"
          AND ${localVisitDay} = ${date}::date
        ORDER BY v."created_at" DESC
        LIMIT 1
      ) v ON TRUE
      WHERE r."tenant_id" = ${tenantId}
        AND r."status" = 'redeemed'
        AND r."redeemed_at" IS NOT NULL
        AND ${localRedeemDay} = ${date}::date
      GROUP BY ${locationExpr}
    `,
  )

  type VisitRow = {
    locationId: string
    totalVisits: number
    uniqueClients: number
    newClients: number
  }
  const visitRows = visitAgg.rows as VisitRow[]
  const rewardRows = rewardAgg.rows as Array<{ locationId: string; rewardsRedeemed: number }>

  // Merge by location so a day with redemptions but no visits still gets a row.
  const byLocation = new Map<string, VisitRow & { rewardsRedeemed: number }>()
  for (const r of visitRows) byLocation.set(r.locationId, { ...r, rewardsRedeemed: 0 })
  for (const r of rewardRows) {
    const cur = byLocation.get(r.locationId) ?? {
      locationId: r.locationId,
      totalVisits: 0,
      uniqueClients: 0,
      newClients: 0,
      rewardsRedeemed: 0,
    }
    cur.rewardsRedeemed = r.rewardsRedeemed
    byLocation.set(r.locationId, cur)
  }

  for (const row of byLocation.values()) {
    await db
      .insert(visitsDaily)
      .values({
        tenantId,
        date,
        locationId: row.locationId,
        totalVisits: row.totalVisits,
        uniqueClients: row.uniqueClients,
        newClients: row.newClients,
        rewardsRedeemed: row.rewardsRedeemed,
      })
      .onConflictDoUpdate({
        target: [visitsDaily.tenantId, visitsDaily.date, visitsDaily.locationId],
        set: {
          totalVisits: row.totalVisits,
          uniqueClients: row.uniqueClients,
          newClients: row.newClients,
          rewardsRedeemed: row.rewardsRedeemed,
        },
      })
  }

  return { rows: byLocation.size }
}
