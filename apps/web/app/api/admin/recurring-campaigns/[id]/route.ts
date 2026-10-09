import { db, eq, recurringCampaigns, tenants } from "@cuik/db"
import { z } from "zod"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { ruleOf } from "@/lib/campaigns/recurring"
import { computeNextRun, statsFor, toApi } from "@/lib/campaigns/recurring-api"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bodySchema = z.object({ status: z.enum(["active", "paused"]) })

/**
 * PATCH /api/admin/recurring-campaigns/[id] { status: "active" | "paused" }
 * Pause or resume a recurring template from the super-admin. Resuming
 * recomputes the next send exactly like the merchant route does.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse("Not found", 404)
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Estado inválido", 400)

    const [row] = await db
      .select({ r: recurringCampaigns, timezone: tenants.timezone })
      .from(recurringCampaigns)
      .innerJoin(tenants, eq(tenants.id, recurringCampaigns.tenantId))
      .where(eq(recurringCampaigns.id, id))
      .limit(1)
    if (!row) return errorResponse("Not found", 404)
    const timezone = row.timezone ?? "America/Lima"
    const nextStatus = parsed.data.status
    if (row.r.status === "finished") {
      return errorResponse("Esta recurrente ya terminó; el comercio debe editar su regla", 400)
    }
    const resumed = row.r.status !== "active" && nextStatus === "active"
    let nextRunAt: Date | null | undefined
    if (resumed) {
      nextRunAt = computeNextRun(ruleOf(row.r), new Date(), timezone, row.r.occurrencesCount)
      if (!nextRunAt) return errorResponse("La regla no produce ninguna fecha de envío futura", 400)
    }

    console.info(`[admin-recurring] user=${session.user.id} recurring=${id} status=${nextStatus}`)
    const [updated] = await db
      .update(recurringCampaigns)
      .set({
        status: nextStatus,
        ...(nextRunAt !== undefined ? { nextRunAt } : {}),
        ...(resumed ? { pausedReason: null, emptyStreak: 0 } : {}),
        ...(nextStatus === "paused" ? { pausedReason: "Pausada por Cuik" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(recurringCampaigns.id, id))
      .returning()
    const stats = await statsFor([updated.id])
    return successResponse(toApi(updated, timezone, stats.get(updated.id)))
  } catch (error) {
    console.error("[PATCH /api/admin/recurring-campaigns/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
