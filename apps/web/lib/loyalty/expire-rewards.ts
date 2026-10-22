import { and, clients, db, eq, inArray, isNotNull, lte, rewards, tenants } from "@cuik/db"

import { refreshStampsPass } from "@/lib/wallet/refresh-stamps-pass"

/**
 * Stamps rewards past their `expiresAt` (promotion "rewardExpirationDays")
 * stop being pending: the till, the client detail and the pass all count
 * `status = 'pending'`, so without this sweep an expired reward kept showing
 * "1 premio pendiente" until someone tried to redeem it. Each affected pass is
 * redrawn so the client sees it too. Never throws per client.
 *
 * At most BATCH rewards per run (the cron is hourly): a large first backlog
 * is spread over several runs instead of one long request that a timeout
 * could cut after the UPDATE and before every pass was redrawn.
 */
const BATCH = 200

export async function expireDueRewards(): Promise<{
  rewards: number
  clients: number
  errors: string[]
}> {
  const due = and(
    eq(rewards.status, "pending"),
    isNotNull(rewards.expiresAt),
    // JS date, like expiresAt is written: no dependence on the DB session timezone.
    lte(rewards.expiresAt, new Date()),
  )
  const batch = await db.select({ id: rewards.id }).from(rewards).where(due).limit(BATCH)
  if (batch.length === 0) return { rewards: 0, clients: 0, errors: [] }
  const expired = await db
    .update(rewards)
    .set({ status: "expired" })
    .where(
      and(
        due,
        inArray(
          rewards.id,
          batch.map((b) => b.id),
        ),
      ),
    )
    .returning({ clientId: rewards.clientId })

  const clientIds = [...new Set(expired.map((r) => r.clientId))]
  if (clientIds.length === 0) return { rewards: 0, clients: 0, errors: [] }

  const rows = await db
    .select({
      qrCode: clients.qrCode,
      tenantId: clients.tenantId,
      tenantName: tenants.name,
      status: clients.status,
    })
    .from(clients)
    .innerJoin(tenants, eq(tenants.id, clients.tenantId))
    .where(inArray(clients.id, clientIds))

  const errors: string[] = []
  for (const row of rows) {
    // Archived / deleted clients are never pushed.
    if (!row.qrCode) continue
    if (row.status !== "active" && row.status !== "inactive" && row.status !== "blocked") continue
    try {
      await refreshStampsPass(row.qrCode, row.tenantId, row.tenantName)
    } catch (err) {
      errors.push(`${row.qrCode}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { rewards: expired.length, clients: clientIds.length, errors }
}
