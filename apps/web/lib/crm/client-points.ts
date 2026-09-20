import {
  clients,
  db,
  desc,
  eq,
  inArray,
  pointsTransactions,
  rewardCatalog,
  sql,
  user,
  visits,
} from "@cuik/db"

export type PointsMovementKind =
  | "purchase" // earn from a visit
  | "bonus" // opt-in / registration bonus
  | "birthday" // earn with the birthday multiplier
  | "multiplier" // earn with a day/hour multiplier
  | "redeem"
  | "expire"
  | "adjust"

export type PointsMovement = {
  id: string
  /** ISO timestamp (UTC). */
  at: string
  type: "earn" | "redeem" | "expire" | "adjust"
  kind: PointsMovementKind
  /** Signed: positive earns, negative redeems. */
  amount: number
  /** Balance right after this movement (recomputed from the current balance). */
  balanceAfter: number
  description: string | null
  rewardName: string | null
  /** Purchase amount of the visit, when the movement came from one. */
  visitAmount: number | null
  /** Points before multipliers (only for earns written since sep-2026). */
  basePoints: number | null
  bonusReasons: string[]
  /** Cashier who registered the visit or handed the reward, when known. */
  by: string | null
}

export type ClientPointsHistory = {
  balance: number
  totalEarned: number
  totalRedeemed: number
  movements: PointsMovement[]
}

type Meta = {
  cashierId?: string
  balanceAfter?: number
  basePoints?: number
  bonusReasons?: string[]
}

function readMeta(raw: unknown): Meta {
  if (!raw || typeof raw !== "object") return {}
  const m = raw as Record<string, unknown>
  return {
    cashierId: typeof m.cashierId === "string" ? m.cashierId : undefined,
    balanceAfter: typeof m.balanceAfter === "number" ? m.balanceAfter : undefined,
    basePoints: typeof m.basePoints === "number" ? m.basePoints : undefined,
    bonusReasons: Array.isArray(m.bonusReasons)
      ? m.bonusReasons.filter((r): r is string => typeof r === "string")
      : undefined,
  }
}

function kindOf(
  type: PointsMovement["type"],
  visitSource: string | null,
  bonusReasons: string[],
): PointsMovementKind {
  if (type === "redeem") return "redeem"
  if (type === "expire") return "expire"
  if (type === "adjust") return "adjust"
  if (visitSource === "bonus") return "bonus"
  if (bonusReasons.includes("birthday_multiplier")) return "birthday"
  if (bonusReasons.some((r) => r.endsWith("_multiplier"))) return "multiplier"
  return "purchase"
}

/**
 * Points statement of one client: every movement newest first with the
 * balance after each one. Balances are recomputed backwards from the current
 * `clients.points_balance` (all movements go through points_transactions), so
 * the column stays consistent even for rows written before `balanceAfter`
 * existed in metadata.
 */
export async function getClientPointsHistory(params: {
  tenantId: string
  clientId: string
  limit?: number
}): Promise<ClientPointsHistory> {
  const { tenantId, clientId } = params
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000)

  const [clientRows, txRows, totals] = await Promise.all([
    db
      .select({ balance: clients.pointsBalance })
      .from(clients)
      .where(sql`${clients.id} = ${clientId} AND ${clients.tenantId} = ${tenantId}`)
      .limit(1),
    db
      .select({
        id: pointsTransactions.id,
        at: pointsTransactions.createdAt,
        type: pointsTransactions.type,
        amount: pointsTransactions.amount,
        description: pointsTransactions.description,
        metadata: pointsTransactions.metadata,
        rewardName: rewardCatalog.name,
        visitSource: visits.source,
        visitAmount: visits.amount,
        visitCashier: user.name,
      })
      .from(pointsTransactions)
      .leftJoin(rewardCatalog, eq(rewardCatalog.id, pointsTransactions.catalogItemId))
      .leftJoin(visits, eq(visits.id, pointsTransactions.visitId))
      .leftJoin(user, eq(user.id, visits.registeredBy))
      .where(
        sql`${pointsTransactions.clientId} = ${clientId} AND ${pointsTransactions.tenantId} = ${tenantId}`,
      )
      .orderBy(desc(pointsTransactions.createdAt), desc(pointsTransactions.id))
      .limit(limit),
    db
      .select({
        earned: sql<number>`COALESCE(SUM(${pointsTransactions.amount}) FILTER (WHERE ${pointsTransactions.amount} > 0), 0)::int`,
        redeemed: sql<number>`COALESCE(SUM(-${pointsTransactions.amount}) FILTER (WHERE ${pointsTransactions.type} = 'redeem'), 0)::int`,
      })
      .from(pointsTransactions)
      .where(
        sql`${pointsTransactions.clientId} = ${clientId} AND ${pointsTransactions.tenantId} = ${tenantId}`,
      ),
  ])

  const balance = clientRows[0]?.balance ?? 0

  // Redeem rows keep the cashier id in metadata; resolve the names in one query.
  const metas = txRows.map((r) => readMeta(r.metadata))
  const cashierIds = [
    ...new Set(metas.map((m) => m.cashierId).filter((id): id is string => Boolean(id))),
  ]
  const cashierNames = new Map<string, string>()
  if (cashierIds.length > 0) {
    const rows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, cashierIds))
    for (const r of rows) cashierNames.set(r.id, r.name)
  }

  // Newest first: the newest movement ends at the current balance.
  let running = balance
  const movements: PointsMovement[] = txRows.map((r, i) => {
    const meta = metas[i]
    const bonusReasons = meta.bonusReasons ?? []
    const balanceAfter = running
    running -= r.amount
    return {
      id: r.id,
      at: r.at.toISOString(),
      type: r.type,
      kind: kindOf(r.type, r.visitSource, bonusReasons),
      amount: r.amount,
      balanceAfter,
      description: r.description,
      rewardName: r.rewardName,
      visitAmount: r.visitAmount ? Number(r.visitAmount) : null,
      basePoints: meta.basePoints ?? null,
      bonusReasons,
      by: (meta.cashierId ? cashierNames.get(meta.cashierId) : undefined) ?? r.visitCashier ?? null,
    }
  })

  return {
    balance,
    totalEarned: Number(totals[0]?.earned ?? 0),
    totalRedeemed: Number(totals[0]?.redeemed ?? 0),
    movements,
  }
}
