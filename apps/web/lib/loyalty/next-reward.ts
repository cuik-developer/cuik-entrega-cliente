import { and, asc, clients, db, eq, or, rewards, sql } from "@cuik/db"

/** The stamps reward a "Canjear" at the till hands over next. */
export type NextReward = {
  /** What the reward says ("Helado gratis", "Cashback S/ 22.90"). */
  label: string | null
  /** Amount to discount at the till; null for a gift. */
  cashbackAmount: number | null
}

/**
 * The reward `redeemReward` would take for this client: the oldest pending one
 * that has not expired (same filter and order). Escanear and Buscar show it
 * before the cashier confirms, so a gift left from before a switch to cashback
 * reads as that gift, not as money.
 */
export async function nextPendingReward(
  qrCode: string,
  tenantId: string,
): Promise<NextReward | null> {
  const [row] = await db
    .select({ label: rewards.rewardType, cashbackAmount: rewards.cashbackAmount })
    .from(rewards)
    .innerJoin(clients, eq(clients.id, rewards.clientId))
    .where(
      and(
        eq(clients.qrCode, qrCode),
        eq(clients.tenantId, tenantId),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "pending"),
        or(sql`${rewards.expiresAt} IS NULL`, sql`${rewards.expiresAt} > NOW()`),
      ),
    )
    .orderBy(asc(rewards.createdAt), asc(rewards.id))
    .limit(1)
  if (!row) return null
  const amount = row.cashbackAmount === null ? null : Number(row.cashbackAmount)
  return {
    label: row.label,
    cashbackAmount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
  }
}
