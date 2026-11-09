import { and, clients, db, desc, eq, programPhases, promotions, sql, user, visits } from "@cuik/db"
import {
  type CashbackSettings,
  cashbackSettingsOf,
  stampsPromotionConfigSchema,
} from "@cuik/shared/validators"

import { cashbackCentsFor, centsToNumeric, fromCents, toCents } from "./cashback"

type Db = typeof db
type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Program phases ("etapas"): a dated marker in a tenant's program, with a
 * snapshot of the key numbers at that moment. Reports compare before/after it;
 * nothing before it is deleted or moved. Created by Cuik from the tenant page,
 * or automatically when the stamps reward switches to cashback (which also
 * seeds the cashback balances of the cards in progress).
 */

export type PhaseBaseline = {
  takenAt: string
  program: {
    type: string | null
    maxVisits: number | null
    rewardMode: "gift" | "cashback" | null
    cashbackPercent: number | null
  }
  clients: {
    /** active + inactive (archived and deleted never count). */
    total: number
    withCardInProgress: number
    avgStampsOnCard: number | null
  }
  visits: {
    last30: number
    last90: number
    uniqueClients30: number
    uniqueClients90: number
  }
  rewards: {
    redeemedLast90: number
    pending: number
  }
  cashback: {
    /** Clients whose card got a seeded balance when the mode switched. */
    seededClients: number
    /** Soles seeded in total ("123.40"). */
    seededTotal: string
  } | null
}

export type ProgramPhase = {
  id: string
  name: string
  startsOn: string
  note: string | null
  baseline: PhaseBaseline | null
  createdAt: string
  createdBy: { id: string | null; name: string | null }
}

/** The key numbers of the tenant's program right now. */
export async function snapshotBaseline(
  tenantId: string,
  exec: Executor = db,
  cashback: PhaseBaseline["cashback"] = null,
): Promise<PhaseBaseline> {
  const [promo] = await exec
    .select({ type: promotions.type, maxVisits: promotions.maxVisits, config: promotions.config })
    .from(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
    .orderBy(sql`CASE WHEN ${promotions.type} = 'points' THEN 0 ELSE 1 END`, promotions.createdAt)
    .limit(1)
  const stampsCfg =
    promo?.type === "stamps" ? stampsPromotionConfigSchema.safeParse(promo.config ?? {}) : null
  const settings = stampsCfg?.success ? cashbackSettingsOf(stampsCfg.data.stamps) : null
  const maxVisits = promo?.type === "stamps" ? (promo.maxVisits ?? 0) : 0

  const [c] = await exec
    .select({
      total: sql<number>`count(*)::int`,
      inProgress:
        maxVisits > 0
          ? sql<number>`count(*) FILTER (WHERE ((${clients.totalVisits} - ${clients.stampsCashed}) % ${maxVisits}) > 0)::int`
          : sql<number>`0::int`,
      avgOnCard:
        maxVisits > 0
          ? sql<
              string | null
            >`avg(((${clients.totalVisits} - ${clients.stampsCashed}) % ${maxVisits})) FILTER (WHERE ${clients.totalVisits} > 0)::text`
          : sql<string | null>`NULL`,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), sql`${clients.status} IN ('active', 'inactive')`))

  const [v] = await exec
    .select({
      last30: sql<number>`count(*) FILTER (WHERE ${visits.createdAt} >= now() - interval '30 days')::int`,
      last90: sql<number>`count(*) FILTER (WHERE ${visits.createdAt} >= now() - interval '90 days')::int`,
      unique30: sql<number>`count(DISTINCT ${visits.clientId}) FILTER (WHERE ${visits.createdAt} >= now() - interval '30 days')::int`,
      unique90: sql<number>`count(DISTINCT ${visits.clientId}) FILTER (WHERE ${visits.createdAt} >= now() - interval '90 days')::int`,
    })
    .from(visits)
    .where(eq(visits.tenantId, tenantId))

  const [r] = await exec
    .execute<{ redeemed90: number; pending: number }>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'redeemed' AND redeemed_at >= now() - interval '90 days')::int AS "redeemed90",
      count(*) FILTER (WHERE status = 'pending')::int AS "pending"
    FROM loyalty.rewards WHERE tenant_id = ${tenantId}::uuid
  `)
    .then((res) => res.rows)

  return {
    takenAt: new Date().toISOString(),
    program: {
      type: promo?.type ?? null,
      maxVisits: promo?.maxVisits ?? null,
      rewardMode: stampsCfg?.success ? stampsCfg.data.stamps.rewardMode : null,
      cashbackPercent: settings?.percent ?? null,
    },
    clients: {
      total: Number(c?.total ?? 0),
      withCardInProgress: Number(c?.inProgress ?? 0),
      avgStampsOnCard:
        c?.avgOnCard == null ? null : Math.round(Number.parseFloat(c.avgOnCard) * 10) / 10,
    },
    visits: {
      last30: Number(v?.last30 ?? 0),
      last90: Number(v?.last90 ?? 0),
      uniqueClients30: Number(v?.unique30 ?? 0),
      uniqueClients90: Number(v?.unique90 ?? 0),
    },
    rewards: {
      redeemedLast90: Number(r?.redeemed90 ?? 0),
      pending: Number(r?.pending ?? 0),
    },
    cashback,
  }
}

/** Today in the tenant's timezone as "YYYY-MM-DD". */
export function localToday(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone })
}

export async function createProgramPhase(
  input: {
    tenantId: string
    name: string
    startsOn: string
    note?: string | null
    createdBy: string | null
    cashback?: PhaseBaseline["cashback"]
  },
  exec: Executor = db,
): Promise<{ id: string }> {
  const baseline = await snapshotBaseline(input.tenantId, exec, input.cashback ?? null)
  const [row] = await exec
    .insert(programPhases)
    .values({
      tenantId: input.tenantId,
      name: input.name.trim(),
      startsOn: input.startsOn,
      note: input.note?.trim() || null,
      baseline,
      createdBy: input.createdBy,
    })
    .returning({ id: programPhases.id })
  return { id: row.id }
}

/** Phases of a tenant, newest start first. */
export async function listProgramPhases(tenantId: string): Promise<ProgramPhase[]> {
  const rows = await db
    .select({
      id: programPhases.id,
      name: programPhases.name,
      startsOn: programPhases.startsOn,
      note: programPhases.note,
      baseline: programPhases.baseline,
      createdAt: programPhases.createdAt,
      createdById: programPhases.createdBy,
      createdByName: user.name,
    })
    .from(programPhases)
    .leftJoin(user, eq(user.id, programPhases.createdBy))
    .where(eq(programPhases.tenantId, tenantId))
    .orderBy(desc(programPhases.startsOn), desc(programPhases.createdAt))
    .limit(50)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startsOn: String(r.startsOn),
    note: r.note,
    baseline: (r.baseline as PhaseBaseline | null) ?? null,
    createdAt: r.createdAt.toISOString(),
    createdBy: { id: r.createdById, name: r.createdByName },
  }))
}

/**
 * When a stamps program switches its reward to cashback, the cards already in
 * progress get the balance of the stamps they hold: each visit of the current
 * card with a recorded amount receives `percent` of it, and the client's
 * balance is the sum. Visits without an amount (older systems, bonus stamps)
 * contribute nothing. Idempotent: visits that already have a cashback amount
 * are left as they are. Returns how many clients got a balance and the total.
 */
export async function seedCashbackBalances(
  tenantId: string,
  settings: CashbackSettings,
  exec: Executor = db,
): Promise<{ seededClients: number; seededTotal: string }> {
  const rows = await exec
    .select({ id: visits.id, amount: visits.amount })
    .from(visits)
    .innerJoin(clients, eq(clients.id, visits.clientId))
    .where(
      and(
        eq(visits.tenantId, tenantId),
        eq(visits.cycleNumber, clients.currentCycle),
        sql`${visits.cashbackAmount} IS NULL`,
        sql`${visits.amount} IS NOT NULL`,
        sql`${clients.status} IN ('active', 'inactive')`,
      ),
    )

  const values: { id: string; amount: string }[] = []
  for (const v of rows) {
    if (v.amount === null) continue
    values.push({ id: v.id, amount: centsToNumeric(cashbackCentsFor(v.amount, settings)) })
  }
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500)
    await exec.execute(sql`
      UPDATE loyalty.visits AS v
      SET cashback_amount = d.amount::numeric
      FROM (VALUES ${sql.join(
        chunk.map((d) => sql`(${d.id}::uuid, ${d.amount})`),
        sql`, `,
      )}) AS d(id, amount)
      WHERE v.id = d.id
    `)
  }

  const updated = await exec.execute<{ client_id: string; balance: string }>(sql`
    UPDATE loyalty.clients AS c
    SET cashback_balance = s.total
    FROM (
      SELECT c2.id AS client_id, COALESCE(SUM(v.cashback_amount), 0) AS total
      FROM loyalty.clients c2
      LEFT JOIN loyalty.visits v
        ON v.client_id = c2.id AND v.tenant_id = c2.tenant_id AND v.cycle_number = c2.current_cycle
      WHERE c2.tenant_id = ${tenantId}::uuid AND c2.status IN ('active', 'inactive')
      GROUP BY c2.id
    ) AS s
    WHERE c.id = s.client_id
    RETURNING c.id AS client_id, c.cashback_balance::text AS balance
  `)
  let seededClients = 0
  let totalCents = 0
  for (const row of updated.rows) {
    const cents = toCents(row.balance)
    if (cents > 0) {
      seededClients += 1
      totalCents += cents
    }
  }
  return { seededClients, seededTotal: fromCents(totalCents).toFixed(2) }
}
