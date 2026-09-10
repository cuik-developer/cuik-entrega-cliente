import { and, db, eq, rewards, sql } from "@cuik/db"

/**
 * Pending rewards per client as a subquery to LEFT JOIN onto `clients`
 * (same pattern as visitStatsSubquery — never a correlated subquery in the
 * select list, Drizzle strips the table qualifier there).
 *
 *   const rs = pendingRewardsSubquery(tenant.id)
 *   db.select({ pendingRewards: rs.pendingRewards }).from(clients).leftJoin(rs, eq(rs.clientId, clients.id))
 */
export function pendingRewardsSubquery(tenantId: string) {
  return db
    .select({
      clientId: rewards.clientId,
      pendingRewards: sql<number>`COUNT(*)::int`.as("pending_rewards"),
    })
    .from(rewards)
    .where(and(eq(rewards.tenantId, tenantId), eq(rewards.status, "pending")))
    .groupBy(rewards.clientId)
    .as("reward_stats")
}
