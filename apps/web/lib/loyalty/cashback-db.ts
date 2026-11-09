import { and, clients, db, eq, promotions, rewards, sql } from "@cuik/db"
import {
  type CashbackSettings,
  cashbackSettingsOf,
  stampsPromotionConfigSchema,
} from "@cuik/shared/validators"

import { type CashbackTemplateVars, cashbackTemplateVars, fromCents, toCents } from "./cashback"
import type { ClientCashback } from "./types"

type Db = typeof db
/** `db` or a transaction: both run the same queries. */
type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Cashback settings of the tenant's active stamps promotion, or null (gift reward, points, none). */
export async function activeCashbackSettings(
  tenantId: string,
  exec: Executor = db,
): Promise<CashbackSettings | null> {
  const [promo] = await exec
    .select({ config: promotions.config })
    .from(promotions)
    .where(
      and(
        eq(promotions.tenantId, tenantId),
        eq(promotions.type, "stamps"),
        eq(promotions.active, true),
      ),
    )
    .limit(1)
  if (!promo) return null
  const parsed = stampsPromotionConfigSchema.safeParse(promo.config ?? {})
  return parsed.success ? cashbackSettingsOf(parsed.data.stamps) : null
}

/** Sum, in cents, of the client's pending cashback rewards (completed cards not yet paid). */
export async function pendingCashbackCents(
  clientId: string,
  tenantId: string,
  exec: Executor = db,
): Promise<number> {
  const [row] = await exec
    .select({ total: sql<string>`COALESCE(SUM(${rewards.cashbackAmount}), 0)::text` })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, clientId),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "pending"),
      ),
    )
  return toCents(row?.total ?? 0)
}

/**
 * Cashback figures of a client for the till and the status endpoint, or null
 * when the program's reward is not cashback. `balance` may be passed when the
 * caller already has the client row.
 */
export async function clientCashback(
  client: { id: string; cashbackBalance?: string | number | null },
  tenantId: string,
  settings: CashbackSettings | null,
  exec: Executor = db,
): Promise<ClientCashback | null> {
  if (!settings) return null
  let balance = client.cashbackBalance
  if (balance === undefined) {
    const [row] = await exec
      .select({ cashbackBalance: clients.cashbackBalance })
      .from(clients)
      .where(eq(clients.id, client.id))
      .limit(1)
    balance = row?.cashbackBalance ?? 0
  }
  const pending = await pendingCashbackCents(client.id, tenantId, exec)
  return {
    balance: fromCents(toCents(balance)),
    pending: fromCents(pending),
    percent: settings.percent,
  }
}

/**
 * `{{cashback.*}}` variables of one client for a pass or a campaign message,
 * or undefined when the active promotion does not pay cashback (the variables
 * then resolve to "" like any missing value). Reads the promotion itself when
 * `settings` is not given.
 */
export async function cashbackVarsFor(
  client: { id: string; cashbackBalance?: string | number | null },
  tenantId: string,
  settings?: CashbackSettings | null,
  exec: Executor = db,
): Promise<CashbackTemplateVars | undefined> {
  const s = settings === undefined ? await activeCashbackSettings(tenantId, exec) : settings
  if (!s) return undefined
  const figures = await clientCashback(client, tenantId, s, exec)
  if (!figures) return undefined
  return cashbackTemplateVars(s, figures.balance, figures.pending)
}
