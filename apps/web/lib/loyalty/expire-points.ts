import {
  and,
  campaignSegments,
  campaigns,
  clients,
  db,
  eq,
  gt,
  isNull,
  lte,
  pointsTransactions,
  sql,
} from "@cuik/db"
import type { AutomationsConfig, PointsExpiryAutomation } from "@cuik/shared/validators"
import { automationsConfigSchema, DEFAULT_POINTS_EXPIRY_AUTOMATION } from "@cuik/shared/validators"

import { executeCampaign } from "@/lib/campaigns/execute-campaign"
import { triggerWalletUpdate } from "@/lib/wallet/trigger-wallet-update"
import { addDays, formatExpiry, localDateString, localMidnight } from "./expiration"
import { dueLotsByClient } from "./points-lots"

/** Parse tenants.automations (jsonb, may be null/partial) into a full points-expiry config. */
export function getPointsExpiryConfig(raw: unknown): PointsExpiryAutomation {
  const parsed = automationsConfigSchema.safeParse(raw ?? {})
  const cfg: AutomationsConfig = parsed.success ? parsed.data : {}
  return { ...DEFAULT_POINTS_EXPIRY_AUTOMATION, ...(cfg.pointsExpiry ?? {}) }
}

/**
 * Drains every open lot of the tenant whose expiry has passed. One transaction
 * per client (row lock, lots re-read under the lock, expire row, balance
 * update), then a wallet refresh so the pass shows the new balance.
 */
export async function expireDuePoints(params: {
  tenantId: string
  tenantName: string
  now?: Date
}): Promise<{ clients: number; points: number; errors: string[] }> {
  const now = params.now ?? new Date()
  const due = await dueLotsByClient(db, params.tenantId, now)
  let expiredClients = 0
  let expiredPoints = 0
  const errors: string[] = []

  for (const entry of due) {
    try {
      const walletCtx = await db.transaction(async (tx) => {
        const [client] = await tx
          .select()
          .from(clients)
          .where(eq(clients.id, entry.clientId))
          .for("update")
          .limit(1)
        if (!client) return null

        // Re-read under the lock: a redemption may have consumed part of these lots.
        const lots = await tx
          .select({ id: pointsTransactions.id, remaining: pointsTransactions.remaining })
          .from(pointsTransactions)
          .where(
            and(
              eq(pointsTransactions.clientId, client.id),
              eq(pointsTransactions.type, "earn"),
              gt(pointsTransactions.remaining, 0),
              sql`${pointsTransactions.expiresAt} IS NOT NULL`,
              lte(pointsTransactions.expiresAt, now),
            ),
          )
          .for("update")
        const total = lots.reduce((s, l) => s + (l.remaining ?? 0), 0)
        if (total <= 0) return null

        for (const lot of lots) {
          await tx
            .update(pointsTransactions)
            .set({ remaining: 0 })
            .where(eq(pointsTransactions.id, lot.id))
        }
        // Never below zero: legacy balances may not be fully tracked in lots.
        const newBalance = Math.max(0, client.pointsBalance - total)
        const removed = client.pointsBalance - newBalance
        await tx.insert(pointsTransactions).values({
          clientId: client.id,
          tenantId: params.tenantId,
          amount: -removed,
          type: "expire",
          description: `Vencieron ${removed} puntos`,
          metadata: { lotIds: lots.map((l) => l.id), lotsTotal: total, balanceAfter: newBalance },
        })
        await tx.update(clients).set({ pointsBalance: newBalance }).where(eq(clients.id, client.id))

        return {
          qrCode: client.qrCode,
          clientId: client.id,
          clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
          totalVisits: client.totalVisits,
          pointsBalance: newBalance,
          expired: removed,
        }
      })

      if (!walletCtx) continue
      expiredClients++
      expiredPoints += walletCtx.expired
      if (walletCtx.qrCode) {
        await triggerWalletUpdate({
          qrCode: walletCtx.qrCode,
          clientId: walletCtx.clientId,
          clientName: walletCtx.clientName,
          tenantId: params.tenantId,
          tenantName: params.tenantName,
          stampsInCycle: 0,
          maxVisits: 0,
          totalVisits: walletCtx.totalVisits,
          pendingRewards: 0,
          pointsBalance: walletCtx.pointsBalance,
        }).catch((err) => {
          console.error("[expireDuePoints] wallet update failed:", err)
        })
      }
    } catch (err) {
      errors.push(`${entry.clientId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { clients: expiredClients, points: expiredPoints, errors }
}

export type WarningRunResult =
  | { status: "skipped"; reason: "disabled" | "already_sent" | "nobody" }
  | { status: "sent"; campaigns: number; targetCount: number; sentCount: number; errors?: string[] }
  | {
      status: "failed"
      campaigns: number
      targetCount: number
      sentCount: number
      errors: string[]
    }

/**
 * Push to clients who hold points that expire within `daysBefore` days and
 * have not been warned yet. Idempotent per local day (campaign content carries
 * { automation: "points_expiring", date }). One campaign per expiry day, so
 * the message can name the date. Lots are marked `warned_at` so a sliding
 * window never warns twice for the same points.
 */
export async function runPointsExpirationWarning(params: {
  tenantId: string
  tenantName: string
  timezone: string
  config: PointsExpiryAutomation
  now?: Date
}): Promise<WarningRunResult> {
  const { tenantId, tenantName, timezone, config } = params
  if (!config.enabled) return { status: "skipped", reason: "disabled" }
  const now = params.now ?? new Date()
  const dateLocal = localDateString(now, timezone)

  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.tenantId, tenantId),
        sql`${campaigns.content}->>'automation' = 'points_expiring'`,
        sql`${campaigns.content}->>'date' = ${dateLocal}`,
      ),
    )
    .limit(1)
  if (existing.length > 0) return { status: "skipped", reason: "already_sent" }

  // Lots whose last valid day is within the next `daysBefore` days.
  const windowEnd = localMidnight(addDays(dateLocal, config.daysBefore + 1), timezone)
  const lots = await db
    .select({
      id: pointsTransactions.id,
      clientId: pointsTransactions.clientId,
      remaining: pointsTransactions.remaining,
      expiresAt: pointsTransactions.expiresAt,
    })
    .from(pointsTransactions)
    .innerJoin(clients, eq(clients.id, pointsTransactions.clientId))
    .where(
      and(
        eq(pointsTransactions.tenantId, tenantId),
        eq(pointsTransactions.type, "earn"),
        gt(pointsTransactions.remaining, 0),
        isNull(pointsTransactions.warnedAt),
        sql`${pointsTransactions.expiresAt} IS NOT NULL`,
        gt(pointsTransactions.expiresAt, now),
        lte(pointsTransactions.expiresAt, windowEnd),
        sql`${clients.status} IN ('active', 'inactive')`,
      ),
    )
  if (lots.length === 0) return { status: "skipped", reason: "nobody" }

  // Group clients by expiry day.
  const byDay = new Map<string, { expiresAt: Date; clientIds: Set<string>; lotIds: string[] }>()
  for (const lot of lots) {
    if (!lot.expiresAt) continue
    const key = lot.expiresAt.toISOString()
    const g = byDay.get(key) ?? { expiresAt: lot.expiresAt, clientIds: new Set(), lotIds: [] }
    g.clientIds.add(lot.clientId)
    g.lotIds.push(lot.id)
    byDay.set(key, g)
  }

  let targetCount = 0
  let sentCount = 0
  let created = 0
  const errors: string[] = []
  for (const group of byDay.values()) {
    const label = formatExpiry(group.expiresAt, timezone)
    // The date and the business name are the same for the whole group, so
    // they are filled in here (works on Apple and Google alike). Per-client
    // variables ({{client.name}}, {{points.balance}}) stay for the pass renderer.
    const message = config.message
      .replaceAll("{{points.expiresAt}}", label)
      .replaceAll("{{tenant.name}}", tenantName)
    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId,
        name: `Puntos por vencer · ${label}`,
        type: "push",
        message,
        status: "draft",
        content: { automation: "points_expiring", date: dateLocal, expiresAt: group.expiresAt },
      })
      .returning({ id: campaigns.id })
    await db.insert(campaignSegments).values({
      campaignId: campaign.id,
      segmentName: "puntos_por_vencer",
      filter: { clientIds: [...group.clientIds] },
    })
    const result = await executeCampaign(campaign.id)
    created++
    targetCount += result.targetCount
    sentCount += result.sentCount
    if (result.status === "failed") {
      // Nothing delivered: leave the lots un-warned so the next run retries.
      errors.push(...result.errors)
      continue
    }
    await db
      .update(pointsTransactions)
      .set({ warnedAt: now })
      .where(sql`${pointsTransactions.id} = ANY(${`{${group.lotIds.join(",")}}`}::uuid[])`)
  }

  if (errors.length > 0 && sentCount === 0) {
    return { status: "failed", campaigns: created, targetCount, sentCount, errors }
  }
  return {
    status: "sent",
    campaigns: created,
    targetCount,
    sentCount,
    ...(errors.length > 0 ? { errors } : {}),
  }
}
