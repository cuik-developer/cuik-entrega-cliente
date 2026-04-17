import { db, sql, visitsDaily } from "@cuik/db"

/**
 * Upserts a single visits_daily row, incrementing totalVisits by 1.
 * Conditionally increments uniqueClients and newClients based on flags.
 * Called fire-and-forget after visit registration.
 */
export async function updateVisitsDaily(
  tenantId: string,
  locationId: string,
  date: Date,
  opts: { isNewClient: boolean; tenantTimezone: string },
) {
  const { tenantTimezone } = opts
  // Bucket by tenant's local calendar date, not UTC.
  const dateStr = date.toLocaleDateString("en-CA", { timeZone: tenantTimezone })

  await db
    .insert(visitsDaily)
    .values({
      tenantId,
      locationId,
      date: dateStr,
      totalVisits: 1,
      uniqueClients: 1,
      newClients: opts.isNewClient ? 1 : 0,
      rewardsRedeemed: 0,
    })
    .onConflictDoUpdate({
      target: [visitsDaily.tenantId, visitsDaily.date, visitsDaily.locationId],
      set: {
        totalVisits: sql`${visitsDaily.totalVisits} + 1`,
        uniqueClients: sql`${visitsDaily.uniqueClients} + 1`,
        newClients: opts.isNewClient
          ? sql`${visitsDaily.newClients} + 1`
          : sql`${visitsDaily.newClients}`,
      },
    })
}

/**
 * Increments the rewardsRedeemed counter for a given tenant/location/date.
 * Called fire-and-forget after a reward is redeemed or created via cycle completion.
 */
export async function updateRewardsRedeemed(
  tenantId: string,
  locationId: string,
  date: Date,
  tenantTimezone: string,
) {
  // Bucket by tenant's local calendar date, not UTC.
  const dateStr = date.toLocaleDateString("en-CA", { timeZone: tenantTimezone })

  await db
    .insert(visitsDaily)
    .values({
      tenantId,
      locationId,
      date: dateStr,
      totalVisits: 0,
      uniqueClients: 0,
      newClients: 0,
      rewardsRedeemed: 1,
    })
    .onConflictDoUpdate({
      target: [visitsDaily.tenantId, visitsDaily.date, visitsDaily.locationId],
      set: {
        rewardsRedeemed: sql`${visitsDaily.rewardsRedeemed} + 1`,
      },
    })
}
