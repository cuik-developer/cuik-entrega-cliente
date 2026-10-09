import { db, eq, tenants } from "@cuik/db"
import { errorResponse, requireAuth, requireRole } from "@/lib/api-utils"
import {
  activeProgramType,
  buildDatasetXlsx,
  DatasetError,
  parseDatasetQuery,
} from "@/lib/exports/build-dataset"
import { getThresholds, type SegmentationThresholds } from "@/lib/loyalty/client-segments"

/**
 * GET /api/admin/exports?tenantId&dataset&columns=a,b&from&to&status
 * Excel download of one dataset of one tenant (super-admin "Exportar datos").
 */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const url = new URL(request.url)
    const tenantId = url.searchParams.get("tenantId") ?? ""
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return errorResponse("Elige un tenant", 400)
    }
    const q = parseDatasetQuery(url)
    if (q.error) return errorResponse(q.error, 400)

    const [tenant] = await db
      .select({
        id: tenants.id,
        timezone: tenants.timezone,
        businessType: tenants.businessType,
        segmentationConfig: tenants.segmentationConfig,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

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
    console.error("[GET /api/admin/exports]", error)
    return errorResponse("Internal server error", 500)
  }
}
