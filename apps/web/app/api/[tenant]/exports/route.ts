import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
} from "@/lib/api-utils"
import {
  activeProgramType,
  buildDatasetXlsx,
  DatasetError,
  parseDatasetQuery,
} from "@/lib/exports/build-dataset"
import { getThresholds, type SegmentationThresholds } from "@/lib/loyalty/client-segments"

/**
 * GET /api/[tenant]/exports?dataset&columns=a,b&from&to&status
 * Excel download of one dataset of the merchant's own data ("Exportar datos").
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
    // The super-admin's "ver como el comercio" mode is read-only: no bulk PII download there.
    if (session.saViewTenantId) return errorResponse("Modo solo lectura", 403)

    const q = parseDatasetQuery(new URL(request.url))
    if (q.error) return errorResponse(q.error, 400)

    const out = await buildDatasetXlsx({
      program: await activeProgramType(tenant.id),
      tenantId: tenant.id,
      dataset: q.dataset,
      columns: q.columns,
      from: q.from,
      to: q.to,
      clientStatus: q.clientStatus,
      timezone: tenant.timezone ?? "America/Lima",
      thresholds: getThresholds(
        tenant.businessType,
        tenant.segmentationConfig as Partial<SegmentationThresholds> | null,
      ),
    })
    console.info(
      `[export] user=${session.user.id} tenant=${tenant.id} dataset=${q.dataset} rows=${out.rows} from=${q.from ?? "-"} to=${q.to ?? "-"}`,
    )
    return new Response(new Uint8Array(out.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${out.filename}"`,
        "X-Row-Count": String(out.rows),
      },
    })
  } catch (error) {
    if (error instanceof DatasetError) return errorResponse(error.message, 400)
    console.error("[GET /api/[tenant]/exports]", error)
    return errorResponse("Internal server error", 500)
  }
}
