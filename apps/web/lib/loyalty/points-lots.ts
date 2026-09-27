import { and, asc, type db as dbType, eq, gt, isNull, lte, pointsTransactions, sql } from "@cuik/db"
import type { ExpirationPolicy } from "@cuik/shared/validators"

import {
  addDays,
  computeExpiresAt,
  formatExpiry,
  localDateString,
  localMidnight,
} from "./expiration"

/**
 * Points are kept as "lots": every earn row carries `remaining` (what is left
 * of it) and `expires_at`. Redemptions consume the lots that expire first, the
 * expiration cron drains the lots whose date has passed, and the client's
 * `points_balance` stays equal to the sum of open lots.
 *
 * Tolerance: lots that predate the lot columns may not add up to the balance
 * (see migration 0021). Consumption never fails because of that: whatever the
 * lots don't cover is taken from the untracked part of the balance, and
 * expiration only ever drains lots, so a client can never lose points that
 * are not in a dated lot.
 */

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0]
type Db = typeof dbType | Tx

export type EarnLotInput = {
  clientId: string
  tenantId: string
  amount: number
  visitId?: string | null
  description: string
  metadata?: Record<string, unknown>
  policy: ExpirationPolicy
  timezone: string
  earnedAt?: Date
}

/** Insert an earn lot with its remaining balance and expiry. Returns the expiry. */
export async function insertEarnLot(db: Db, input: EarnLotInput): Promise<Date | null> {
  const earnedAt = input.earnedAt ?? new Date()
  const expiresAt = computeExpiresAt(input.policy, earnedAt, input.timezone)
  await db.insert(pointsTransactions).values({
    clientId: input.clientId,
    tenantId: input.tenantId,
    amount: input.amount,
    type: "earn",
    visitId: input.visitId ?? null,
    description: input.description,
    metadata: input.metadata ?? null,
    remaining: input.amount,
    expiresAt,
  })
  return expiresAt
}

export type ConsumedLot = { lotId: string; taken: number; expiresAt: Date | null }

/**
 * Take `amount` points from the client's open lots, soonest-expiring first
 * (lots without expiry go last), then by age. Must run inside the transaction
 * that holds the client row lock. Returns what was taken from which lot; the
 * sum may be less than `amount` when legacy points are not tracked in lots.
 */
export async function consumeLots(
  tx: Tx,
  clientId: string,
  amount: number,
): Promise<ConsumedLot[]> {
  if (amount <= 0) return []
  const lots = await tx
    .select({
      id: pointsTransactions.id,
      remaining: pointsTransactions.remaining,
      expiresAt: pointsTransactions.expiresAt,
    })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.clientId, clientId),
        eq(pointsTransactions.type, "earn"),
        gt(pointsTransactions.remaining, 0),
      ),
    )
    .orderBy(sql`${pointsTransactions.expiresAt} ASC NULLS LAST`, asc(pointsTransactions.createdAt))
    .for("update")

  const consumed: ConsumedLot[] = []
  let left = amount
  for (const lot of lots) {
    if (left <= 0) break
    const take = Math.min(lot.remaining ?? 0, left)
    if (take <= 0) continue
    await tx
      .update(pointsTransactions)
      .set({ remaining: sql`${pointsTransactions.remaining} - ${take}` })
      .where(eq(pointsTransactions.id, lot.id))
    consumed.push({ lotId: lot.id, taken: take, expiresAt: lot.expiresAt })
    left -= take
  }
  return consumed
}

export type NextExpiration = { amount: number; expiresAt: Date } | null

/** Soonest-expiring open lot(s) of a client: how many points and when. */
export async function nextExpiration(db: Db, clientId: string): Promise<NextExpiration> {
  const [row] = await db
    .select({
      expiresAt: pointsTransactions.expiresAt,
      amount: sql<number>`SUM(${pointsTransactions.remaining})::int`,
    })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.clientId, clientId),
        eq(pointsTransactions.type, "earn"),
        gt(pointsTransactions.remaining, 0),
        sql`${pointsTransactions.expiresAt} IS NOT NULL`,
      ),
    )
    .groupBy(pointsTransactions.expiresAt)
    .orderBy(asc(pointsTransactions.expiresAt))
    .limit(1)
  if (!row?.expiresAt) return null
  return { amount: Number(row.amount), expiresAt: row.expiresAt }
}

/**
 * `{{points.expiring}}` / `{{points.expiresAt}}` for a pass template context.
 * Never throws: a failure here must not block a pass, so it falls back to
 * empty strings ("nothing expires").
 */
export async function pointsExpiryTemplateVars(
  db: Db,
  clientId: string,
  timezone: string,
): Promise<{ expiring: number | string; expiresAt: string }> {
  try {
    const upcoming = await nextExpiration(db, clientId)
    return upcoming
      ? { expiring: upcoming.amount, expiresAt: formatExpiry(upcoming.expiresAt, timezone) }
      : { expiring: "", expiresAt: "" }
  } catch (err) {
    console.warn("[points] nextExpiration failed, rendering pass without expiry:", err)
    return { expiring: "", expiresAt: "" }
  }
}

/** Points expiring on or before `until` (open lots only). */
export async function pointsExpiringBy(db: Db, clientId: string, until: Date): Promise<number> {
  const [row] = await db
    .select({ amount: sql<number>`COALESCE(SUM(${pointsTransactions.remaining}), 0)::int` })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.clientId, clientId),
        eq(pointsTransactions.type, "earn"),
        gt(pointsTransactions.remaining, 0),
        sql`${pointsTransactions.expiresAt} IS NOT NULL`,
        lte(pointsTransactions.expiresAt, until),
      ),
    )
  return Number(row?.amount ?? 0)
}

/** How many clients hold open lots that expire within the next `days` days. */
export async function clientsWithPointsExpiringSoon(
  db: Db,
  tenantId: string,
  timezone: string,
  days: number,
  now = new Date(),
): Promise<number> {
  const windowEnd = localMidnight(addDays(localDateString(now, timezone), days + 1), timezone)
  const [row] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${pointsTransactions.clientId})::int` })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.tenantId, tenantId),
        eq(pointsTransactions.type, "earn"),
        gt(pointsTransactions.remaining, 0),
        sql`${pointsTransactions.expiresAt} IS NOT NULL`,
        gt(pointsTransactions.expiresAt, now),
        lte(pointsTransactions.expiresAt, windowEnd),
      ),
    )
  return Number(row?.n ?? 0)
}

/**
 * Re-stamp the open lots of a tenant after its policy changed. Called from the
 * super-admin action, in the same transaction as the promotion update.
 *
 * - never:   clear every expiry (nothing will be drained).
 * - rolling: lots keep their own date when they have one; lots without a date
 *            (points earned before expiration existed) start counting from
 *            today, so nobody loses points on activation day.
 * - fixed schedules (weekly / monthly / interval): every open lot expires at
 *            the first cutoff after now.
 */
export async function restampOpenLots(
  db: Db,
  params: { tenantId: string; policy: ExpirationPolicy; timezone: string; now?: Date },
): Promise<{ updated: number }> {
  const now = params.now ?? new Date()
  const open = and(
    eq(pointsTransactions.tenantId, params.tenantId),
    eq(pointsTransactions.type, "earn"),
    gt(pointsTransactions.remaining, 0),
  )
  if (params.policy.mode === "never") {
    const rows = await db
      .update(pointsTransactions)
      .set({ expiresAt: null, warnedAt: null })
      .where(open)
      .returning({ id: pointsTransactions.id })
    return { updated: rows.length }
  }
  const expiresAt = computeExpiresAt(params.policy, now, params.timezone)
  const where =
    params.policy.mode === "rolling" ? and(open, isNull(pointsTransactions.expiresAt)) : open
  const rows = await db
    .update(pointsTransactions)
    .set({ expiresAt, warnedAt: null })
    .where(where)
    .returning({ id: pointsTransactions.id })
  return { updated: rows.length }
}

/** Open lots (any client) of a tenant whose expiry has passed, grouped per client. */
export async function dueLotsByClient(
  db: Db,
  tenantId: string,
  now: Date,
): Promise<Array<{ clientId: string; amount: number; lotIds: string[] }>> {
  const rows = await db
    .select({
      id: pointsTransactions.id,
      clientId: pointsTransactions.clientId,
      remaining: pointsTransactions.remaining,
    })
    .from(pointsTransactions)
    .where(
      and(
        eq(pointsTransactions.tenantId, tenantId),
        eq(pointsTransactions.type, "earn"),
        gt(pointsTransactions.remaining, 0),
        sql`${pointsTransactions.expiresAt} IS NOT NULL`,
        lte(pointsTransactions.expiresAt, now),
      ),
    )
  const byClient = new Map<string, { clientId: string; amount: number; lotIds: string[] }>()
  for (const r of rows) {
    const entry = byClient.get(r.clientId) ?? { clientId: r.clientId, amount: 0, lotIds: [] }
    entry.amount += r.remaining ?? 0
    entry.lotIds.push(r.id)
    byClient.set(r.clientId, entry)
  }
  return [...byClient.values()]
}
