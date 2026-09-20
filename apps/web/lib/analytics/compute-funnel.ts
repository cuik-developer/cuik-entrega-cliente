import { db, sql } from "@cuik/db"
import type { FunnelData } from "@cuik/shared/types/analytics"

/**
 * Lifetime loyalty funnel for a tenant — how far the client base has travelled:
 *
 *   registered → 1+ visit → reward redeemed → 3+ visits
 *
 * Deliberately not scoped to a date range or a location: a client registers once and
 * becomes loyal over months, so a 7-day window would
 * describe almost nobody. Range-scoped activity lives in the summary/visits
 * widgets. Blocked clients are excluded from every step. Wallet installation
 * is deliberately not a step: it is not a prerequisite for visiting, and it
 * already has its own widget (Distribución por plataforma).
 */
export async function computeLoyaltyFunnel(
  tenantId: string,
  programType: "stamps" | "points" = "stamps",
): Promise<FunnelData> {
  // Stamps: a redeemed loyalty.rewards row. Points: a redeem transaction.
  const hasRedeemed =
    programType === "points"
      ? sql`EXISTS (
            SELECT 1 FROM loyalty.points_transactions pt
            WHERE pt."client_id" = c."id" AND pt."tenant_id" = c."tenant_id" AND pt."type" = 'redeem'
          )`
      : sql`EXISTS (
            SELECT 1 FROM loyalty.rewards r
            WHERE r."client_id" = c."id" AND r."tenant_id" = c."tenant_id" AND r."status" = 'redeemed'
          )`
  const result = await db.execute(
    sql`
      WITH base AS (
        SELECT
          c."id",
          (SELECT COUNT(*) FROM loyalty.visits v
            WHERE v."client_id" = c."id" AND v."tenant_id" = c."tenant_id"
              AND v."source" <> 'bonus') AS "visit_count",
          ${hasRedeemed} AS "has_redeemed"
        FROM loyalty.clients c
        WHERE c."tenant_id" = ${tenantId}
          AND c."status" <> 'blocked'
      )
      SELECT
        COUNT(*)::int AS "registered",
        COUNT(*) FILTER (WHERE "visit_count" >= 1)::int AS "visited",
        COUNT(*) FILTER (WHERE "visit_count" >= 3)::int AS "loyal",
        COUNT(*) FILTER (WHERE "has_redeemed")::int AS "redeemed"
      FROM base
    `,
  )

  const row = (result.rows[0] ?? {}) as Partial<
    Record<"registered" | "visited" | "loyal" | "redeemed", number>
  >

  return {
    steps: [
      { key: "registered", count: row.registered ?? 0 },
      { key: "visited", count: row.visited ?? 0 },
      { key: "redeemed", count: row.redeemed ?? 0 },
      { key: "loyal", count: row.loyal ?? 0 },
    ],
  }
}
