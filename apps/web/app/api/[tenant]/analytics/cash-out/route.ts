import { and, db, eq, promotions, sql, tenants } from "@cuik/db"
import { stampsPromotionConfigSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { redeemableMilestone } from "@/lib/loyalty/milestones"

/** Days without a visit after which a client sitting in the cash-out window counts as at risk. */
const AT_RISK_DAYS = 30

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/[tenant]/analytics/cash-out?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Early cash-out ladder ("escalera canjeable") of a stamps program: in the
 * period, how many cashed early and how many completed the card; right now,
 * how many can cash out and how many of those stopped coming. Tells the
 * merchant whether a shorter card would serve better. `enabled: false` when
 * the program has no redeemable milestone.
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
      .select({
        maxVisits: promotions.maxVisits,
        rewardValue: promotions.rewardValue,
        config: promotions.config,
      })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenant.id),
          eq(promotions.type, "stamps"),
          eq(promotions.active, true),
        ),
      )
      .limit(1)
    const maxVisits = promotion?.maxVisits ?? 0
    const milestone =
      promotion && maxVisits > 0
        ? redeemableMilestone(
            stampsPromotionConfigSchema.parse(promotion.config ?? {}).stamps,
            maxVisits,
          )
        : null
    if (!promotion || !milestone) return successResponse({ enabled: false })

    const [tz] = await db
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenant.id))
      .limit(1)
    const timezone = tz?.timezone ?? "America/Lima"
    const localDay = sql`(rw."created_at" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date`

    const [periodRes, nowRes] = await Promise.all([
      db.execute<{ cash_outs: number; avg_stamps: number | null; full_cards: number }>(sql`
        SELECT
          count(*) FILTER (WHERE rw."kind" = 'milestone' AND rw."status" = 'redeemed')::int AS "cash_outs",
          avg(rw."stamps_at_redeem") FILTER (WHERE rw."kind" = 'milestone' AND rw."status" = 'redeemed') AS "avg_stamps",
          count(*) FILTER (WHERE rw."kind" = 'final' AND rw."status" <> 'voided')::int AS "full_cards"
        FROM loyalty.rewards rw
        WHERE rw."tenant_id" = ${tenant.id}::uuid
          AND ${localDay} BETWEEN ${from}::date AND ${to}::date
      `),
      db.execute<{ in_window: number; at_risk: number }>(sql`
        SELECT
          count(*)::int AS "in_window",
          count(*) FILTER (
            WHERE lv."last_visit_at" IS NULL OR lv."last_visit_at" < now() - make_interval(days => ${AT_RISK_DAYS})
          )::int AS "at_risk"
        FROM loyalty.clients c
        LEFT JOIN (
          SELECT "client_id", max("created_at") AS "last_visit_at"
          FROM loyalty.visits WHERE "tenant_id" = ${tenant.id}::uuid
          GROUP BY "client_id"
        ) lv ON lv."client_id" = c."id"
        WHERE c."tenant_id" = ${tenant.id}::uuid
          AND c."status" IN ('active', 'inactive')
          AND ((c."total_visits" - c."stamps_cashed") % ${maxVisits}) >= ${milestone.at}
      `),
    ])

    const p = periodRes.rows[0]
    const n = nowRes.rows[0]
    const avg = p?.avg_stamps == null ? null : Math.round(Number(p.avg_stamps) * 10) / 10
    return successResponse({
      enabled: true,
      milestone: { at: milestone.at, label: milestone.label },
      finalReward: promotion.rewardValue,
      maxVisits,
      atRiskDays: AT_RISK_DAYS,
      period: {
        cashOuts: Number(p?.cash_outs ?? 0),
        avgStampsAtCashOut: avg,
        fullCards: Number(p?.full_cards ?? 0),
      },
      now: {
        inWindow: Number(n?.in_window ?? 0),
        atRisk: Number(n?.at_risk ?? 0),
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/cash-out]", error)
    return errorResponse("Internal server error", 500)
  }
}
