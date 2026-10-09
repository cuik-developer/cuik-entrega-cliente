import { db, eq, tenants } from "@cuik/db"
import {
  adminCampaignStats,
  listAdminCampaigns,
  listAdminRecurring,
} from "@/lib/admin/campaign-admin"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/admin/tenants/[id]/campaigns?status&page
 * Everything the "Campañas" section of the tenant page shows: 30-day figures,
 * the campaign list (paginated) and the recurring templates.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse("Tenant not found", 404)
    const [tenant] = await db
      .select({ id: tenants.id, timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const url = new URL(request.url)
    const statusRaw = url.searchParams.get("status") ?? undefined
    const status = (
      ["draft", "scheduled", "sending", "sent", "cancelled", "failed"].includes(statusRaw ?? "")
        ? statusRaw
        : undefined
    ) as Parameters<typeof listAdminCampaigns>[0]["status"]
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)

    const [stats, list, recurring] = await Promise.all([
      adminCampaignStats(id),
      listAdminCampaigns({ tenantId: id, status, includeInternal: true, page, limit: 25 }),
      listAdminRecurring(id, tenant.timezone ?? "America/Lima"),
    ])
    return successResponse({
      stats,
      campaigns: list.rows,
      pagination: {
        page,
        limit: 25,
        total: list.total,
        totalPages: Math.max(1, Math.ceil(list.total / 25)),
      },
      recurring,
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}
