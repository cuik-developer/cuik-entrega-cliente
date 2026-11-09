import { and, db, eq, promotions, sql, tenants } from "@cuik/db"
import { cashbackSettingsOf, stampsPromotionConfigSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/[tenant]/analytics/cashback?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Cashback reward of a stamps program: in the period, how much cashback the
 * stamps earned and how much was paid at the till (redeemed rewards); right
 * now, the liability (balances on cards in progress + rewards waiting) and
 * how many clients hold it. `enabled: false` when the reward is a gift.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const adminError = await requireTenantAdmin(session, tenant.id)
    if (adminError) return adminError

    const url = new URL(request.url)
    const from = url.searchParams.get("from") ?? ""
    const to = url.searchParams.get("to") ?? ""
    if (!YMD.test(from) || !YMD.test(to) || from > to) {
      return errorResponse("Invalid query parameters", 400)
    }

    const [promotion] = await db
      .select({ maxVisits: promotions.maxVisits, config: promotions.config })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenant.id),
          eq(promotions.type, "stamps"),
          eq(promotions.active, true),
        ),
      )
      .limit(1)
    const parsed = promotion ? stampsPromotionConfigSchema.safeParse(promotion.config ?? {}) : null
    const settings = parsed?.success ? cashbackSettingsOf(parsed.data.stamps) : null
    if (!promotion || !settings) return successResponse({ enabled: false })

    const [tz] = await db
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenant.id))
      .limit(1)
    const timezone = tz?.timezone ?? "America/Lima"

    const [periodRes, nowRes] = await Promise.all([
      db.execute<{
        earned: string
        earned_visits: number
        paid: string
        paid_rewards: number
        avg_purchase: string | null
      }>(sql`
        SELECT
          COALESCE((
            SELECT SUM(v."cashback_amount") FROM loyalty.visits v
            WHERE v."tenant_id" = ${tenant.id}::uuid
              AND (v."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
          ), 0)::text AS "earned",
          (
            SELECT count(*)::int FROM loyalty.visits v
            WHERE v."tenant_id" = ${tenant.id}::uuid AND v."cashback_amount" IS NOT NULL
              AND (v."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
          ) AS "earned_visits",
          (
            SELECT AVG(v."amount")::text FROM loyalty.visits v
            WHERE v."tenant_id" = ${tenant.id}::uuid AND v."cashback_amount" IS NOT NULL AND v."amount" IS NOT NULL
              AND (v."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
          ) AS "avg_purchase",
          COALESCE((
            SELECT SUM(rw."cashback_amount") FROM loyalty.rewards rw
            WHERE rw."tenant_id" = ${tenant.id}::uuid AND rw."status" = 'redeemed' AND rw."cashback_amount" IS NOT NULL
              AND (rw."redeemed_at" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
          ), 0)::text AS "paid",
          (
            SELECT count(*)::int FROM loyalty.rewards rw
            WHERE rw."tenant_id" = ${tenant.id}::uuid AND rw."status" = 'redeemed' AND rw."cashback_amount" IS NOT NULL
              AND (rw."redeemed_at" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
          ) AS "paid_rewards"
      `),
      db.execute<{
        on_cards: string
        clients_with_balance: number
        pending: string
        pending_rewards: number
      }>(sql`
        SELECT
          COALESCE((
            SELECT SUM(c."cashback_balance") FROM loyalty.clients c
            WHERE c."tenant_id" = ${tenant.id}::uuid AND c."status" IN ('active', 'inactive')
          ), 0)::text AS "on_cards",
          (
            SELECT count(*)::int FROM loyalty.clients c
            WHERE c."tenant_id" = ${tenant.id}::uuid AND c."status" IN ('active', 'inactive') AND c."cashback_balance" > 0
          ) AS "clients_with_balance",
          COALESCE((
            SELECT SUM(rw."cashback_amount") FROM loyalty.rewards rw
            WHERE rw."tenant_id" = ${tenant.id}::uuid AND rw."status" = 'pending'
          ), 0)::text AS "pending",
          (
            SELECT count(*)::int FROM loyalty.rewards rw
            WHERE rw."tenant_id" = ${tenant.id}::uuid AND rw."status" = 'pending' AND rw."cashback_amount" IS NOT NULL
          ) AS "pending_rewards"
      `),
    ])

    const p = periodRes.rows[0]
    const n = nowRes.rows[0]
    const num = (v: string | null | undefined) => Math.round(Number.parseFloat(v ?? "0") * 100) / 100
    return successResponse({
      enabled: true,
      percent: settings.percent,
      maxVisits: promotion.maxVisits ?? 0,
      period: {
        earned: num(p?.earned),
        earnedVisits: Number(p?.earned_visits ?? 0),
        avgPurchase: p?.avg_purchase == null ? null : num(p.avg_purchase),
        paid: num(p?.paid),
        paidRewards: Number(p?.paid_rewards ?? 0),
      },
      now: {
        onCards: num(n?.on_cards),
        clientsWithBalance: Number(n?.clients_with_balance ?? 0),
        pending: num(n?.pending),
        pendingRewards: Number(n?.pending_rewards ?? 0),
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/cashback]", error)
    return errorResponse("Internal server error", 500)
  }
}
