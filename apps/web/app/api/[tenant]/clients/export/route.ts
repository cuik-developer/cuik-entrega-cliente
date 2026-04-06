import { clientExportSchema } from "@cuik/shared/validators/crm-schema"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
} from "@/lib/api-utils"
import { exportClientsXlsx } from "@/lib/crm"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"

type Params = { params: Promise<{ tenant: string }> }

export async function GET(request: Request, { params }: Params) {
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

    const url = new URL(request.url)
    const queryParsed = clientExportSchema.safeParse(Object.fromEntries(url.searchParams))
    if (!queryParsed.success) {
      return errorResponse("Invalid query parameters", 400, queryParsed.error.flatten())
    }

    const { format: _format, ...filters } = queryParsed.data

    // Resolve segmentation thresholds for this tenant
    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)

    const buffer = await exportClientsXlsx(tenant.id, filters, thresholds, tenant.timezone)

    const filename = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/export]", error)
    return errorResponse("Internal server error", 500)
  }
}
