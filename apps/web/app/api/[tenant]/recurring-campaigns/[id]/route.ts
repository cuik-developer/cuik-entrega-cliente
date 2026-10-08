import { campaigns, db, eq, recurringCampaigns } from "@cuik/db"
import { updateRecurringCampaignSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { ruleOf } from "@/lib/campaigns/recurring"
import {
  columnsFrom,
  computeNextRun,
  loadOwned,
  statsFor,
  toApi,
} from "@/lib/campaigns/recurring-api"

type Ctx = { params: Promise<{ tenant: string; id: string }> }

async function guard(request: Request, ctx: Ctx) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return { error: authError }
  const roleError = requireRole(session, "admin")
  if (roleError) return { error: roleError }
  const { tenant: slug, id } = await ctx.params
  const tenant = await resolveTenant(slug)
  if (!tenant) return { error: errorResponse("Tenant not found", 404) }
  const membershipError = await requireTenantMembership(session, tenant.id)
  if (membershipError) return { error: membershipError }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: errorResponse("Not found", 404) }
  const row = await loadOwned(id, tenant.id)
  if (!row) return { error: errorResponse("Not found", 404) }
  return { tenant, row, timezone: tenant.timezone ?? "America/Lima" }
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const stats = await statsFor([g.row.id])
    return successResponse(toApi(g.row, g.timezone, stats.get(g.row.id)))
  } catch (error) {
    console.error("[GET /api/[tenant]/recurring-campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * Edit the template, or pause / resume it. Any change to the rule (or a
 * resume) recomputes next_run_at from now; a finished template can be revived
 * by extending its rule.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const parsed = updateRecurringCampaignSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const body = parsed.data

    const merged = {
      name: body.name ?? g.row.name,
      // The template enum allows "email" at the DB level; the API only issues push / wallet_update.
      type: (body.type ?? g.row.type) as "push" | "wallet_update",
      messages: body.messages ?? g.row.messages,
      segment: (body.segment ?? g.row.segmentFilter) as NonNullable<typeof body.segment>,
      rule: body.rule ?? ruleOf(g.row),
      skipIfVisitedDays:
        body.skipIfVisitedDays === undefined ? g.row.skipIfVisitedDays : body.skipIfVisitedDays,
      minDaysSincePush:
        body.minDaysSincePush === undefined ? g.row.minDaysSincePush : body.minDaysSincePush,
    }
    const nextStatus =
      body.status ?? (g.row.status === "finished" && body.rule ? "active" : g.row.status)
    const ruleChanged = body.rule !== undefined
    const resumed = g.row.status !== "active" && nextStatus === "active"

    let nextRunAt = g.row.nextRunAt
    if (nextStatus === "active" && (ruleChanged || resumed)) {
      nextRunAt = computeNextRun(merged.rule, new Date(), g.timezone, g.row.occurrencesCount)
      if (!nextRunAt) {
        return errorResponse("La regla no produce ninguna fecha de envío futura", 400)
      }
    }

    const [row] = await db
      .update(recurringCampaigns)
      .set({
        ...columnsFrom(merged),
        status: nextStatus,
        nextRunAt,
        ...(resumed ? { pausedReason: null, emptyStreak: 0 } : {}),
        ...(body.messages ? { nextMessageIndex: 0 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(recurringCampaigns.id, g.row.id))
      .returning()
    const stats = await statsFor([row.id])
    return successResponse(toApi(row, g.timezone, stats.get(row.id)))
  } catch (error) {
    console.error("[PATCH /api/[tenant]/recurring-campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** Deletes the template. Past occurrences stay in the history, unlinked. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.update(campaigns).set({ recurringId: null }).where(eq(campaigns.recurringId, g.row.id))
    await db.delete(recurringCampaigns).where(eq(recurringCampaigns.id, g.row.id))
    return successResponse({ deleted: true })
  } catch (error) {
    console.error("[DELETE /api/[tenant]/recurring-campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
