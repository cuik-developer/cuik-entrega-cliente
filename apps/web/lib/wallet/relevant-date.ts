import { and, asc, db, eq, gt, isNotNull, pointsTransactions, rewards } from "@cuik/db"

/**
 * Apple `relevantDate` ("Recordatorio de vencimiento" in Configuración →
 * Wallet): the pass is surfaced on the lock screen around the moment
 * something of the client expires — the soonest pending stamps reward, or the
 * soonest points lot. Only future dates count (a date already gone would hide
 * the next real one until the expiry cron runs). Undefined when the option is
 * off or nothing expires. Never throws: a failed lookup must not break the pass.
 * Same answer for every Apple route (download, token download, web service).
 */
export async function passRelevantDate(params: {
  enabled: boolean | undefined
  clientId: string
  tenantId: string
  promotionType: string | null | undefined
  pendingRewards: number
}): Promise<Date | undefined> {
  if (!params.enabled) return undefined
  const now = new Date()

  try {
    if (params.promotionType === "points") {
      const [row] = await db
        .select({ at: pointsTransactions.expiresAt })
        .from(pointsTransactions)
        .where(
          and(
            eq(pointsTransactions.clientId, params.clientId),
            eq(pointsTransactions.type, "earn"),
            gt(pointsTransactions.remaining, 0),
            gt(pointsTransactions.expiresAt, now),
          ),
        )
        .orderBy(asc(pointsTransactions.expiresAt))
        .limit(1)
      return row?.at ?? undefined
    }

    if (params.pendingRewards <= 0) return undefined
    const [row] = await db
      .select({ at: rewards.expiresAt })
      .from(rewards)
      .where(
        and(
          eq(rewards.clientId, params.clientId),
          eq(rewards.tenantId, params.tenantId),
          eq(rewards.status, "pending"),
          isNotNull(rewards.expiresAt),
          gt(rewards.expiresAt, now),
        ),
      )
      .orderBy(asc(rewards.expiresAt))
      .limit(1)
    return row?.at ?? undefined
  } catch (err) {
    console.error("[passRelevantDate] lookup failed, pass built without it:", err)
    return undefined
  }
}
