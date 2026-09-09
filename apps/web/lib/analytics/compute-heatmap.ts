import { and, db, eq, sql, visits } from "@cuik/db"
import type { HeatmapData } from "@cuik/shared/types/analytics"
import { tenantTzLiteral } from "./tenant-tz"

/**
 * Visits bucketed by ISO day-of-week (1 = Monday … 7 = Sunday) and hour of day,
 * both evaluated in the tenant's timezone. Only non-empty cells are returned;
 * the client fills the 7×24 grid.
 */
export async function computeVisitsHeatmap(params: {
  tenantId: string
  timezone: string | null | undefined
  from: string
  to: string
  locationId?: string
}): Promise<HeatmapData> {
  const { tenantId, timezone, from, to, locationId } = params
  const tzLit = tenantTzLiteral(timezone)
  const local = sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLit})`
  const dowExpr = sql`EXTRACT(ISODOW FROM ${local})::int`
  const hourExpr = sql`EXTRACT(HOUR FROM ${local})::int`

  const rows = await db
    .select({
      dow: sql<number>`${dowExpr}`.as("dow"),
      hour: sql<number>`${hourExpr}`.as("hour"),
      visits: sql<number>`COUNT(*)::int`.as("visits"),
    })
    .from(visits)
    .where(
      and(
        eq(visits.tenantId, tenantId),
        sql`(${local})::date >= ${from}::date`,
        sql`(${local})::date <= ${to}::date`,
        locationId ? eq(visits.locationId, locationId) : undefined,
      ),
    )
    .groupBy(dowExpr, hourExpr)

  const cells = rows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    visits: Number(r.visits),
  }))
  const totalVisits = cells.reduce((acc, c) => acc + c.visits, 0)
  return { cells, totalVisits }
}
