import { db, desc, eq, recurringCampaigns } from "@cuik/db"
import { createRecurringCampaignSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { columnsFrom, computeNextRun, statsFor, toApi } from "@/lib/campaigns/recurring-api"

/**
 * Recurring campaigns of a tenant (templates). Occurrences are ordinary rows
 * in /campaigns linked by recurringId; this resource only manages the template.
 */

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "admin")
    if (roleError) return roleError
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const rows = await db
      .select()
      .from(recurringCampaigns)
      .where(eq(recurringCampaigns.tenantId, tenant.id))
      .orderBy(desc(recurringCampaigns.createdAt))
    const stats = await statsFor(rows.map((r) => r.id))
    const timezone = tenant.timezone ?? "America/Lima"
    return successResponse(rows.map((r) => toApi(r, timezone, stats.get(r.id))))
  } catch (error) {
    console.error("[GET /api/[tenant]/recurring-campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "admin")
    if (roleError) return roleError
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const parsed = createRecurringCampaignSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const timezone = tenant.timezone ?? "America/Lima"
    const nextRunAt = computeNextRun(parsed.data.rule, new Date(), timezone, 0)
    if (!nextRunAt) {
      return errorResponse("La regla no produce ninguna fecha de envío futura", 400)
    }

    const [row] = await db
      .insert(recurringCampaigns)
      .values({
        tenantId: tenant.id,
        ...columnsFrom(parsed.data),
        status: "active",
        nextRunAt,
        createdBy: session.user.id,
      })
      .returning()
    return successResponse(toApi(row, timezone), 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/recurring-campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}
