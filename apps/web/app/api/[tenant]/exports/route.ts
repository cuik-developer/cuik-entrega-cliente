import { errorResponse, requireAuth, requireTenantAdmin, resolveTenant } from "@/lib/api-utils"
import {
  activeProgramType,
  buildDatasetXlsx,
  DatasetError,
  parseDatasetQuery,
  resolveTenantAllTimeRange,
} from "@/lib/exports/build-dataset"
import { getThresholds, type SegmentationThresholds } from "@/lib/loyalty/client-segments"

/**
 * GET /api/[tenant]/exports?dataset&columns=a,b&from&to&status
 * Excel download of one dataset of the merchant's own data ("Exportar datos").
 * `from=all` exports since the business started (range resolved per tenant).
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError
    // The super-admin's "ver como el comercio" mode is read-only: no bulk PII download there.
    if (session.saViewTenantId) return errorResponse("Modo solo lectura", 403)

    const q = parseDatasetQuery(new URL(request.url))
    if (q.error) return errorResponse(q.error, 400)

    const timezone = tenant.timezone ?? "America/Lima"
    const range = q.allTime
      ? await resolveTenantAllTimeRange(tenant.id, timezone)
      : { from: q.from, to: q.to }
    const out = await buildDatasetXlsx({
      program: await activeProgramType(tenant.id),
      tenantId: tenant.id,
      dataset: q.dataset,
      columns: q.columns,
      from: range.from,
      to: range.to,
      allTime: q.allTime,
      clientStatus: q.clientStatus,
      timezone,
      thresholds: getThresholds(
        tenant.businessType,
        tenant.segmentationConfig as Partial<SegmentationThresholds> | null,
      ),
    })
    console.info(
      `[export] user=${session.user.id} tenant=${tenant.id} dataset=${q.dataset} rows=${out.rows} from=${out.from ?? "-"} to=${out.to ?? "-"}${q.allTime ? " preset=all" : ""}`,
    )
    const headers: Record<string, string> = {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
      "X-Row-Count": String(out.rows),
    }
    if (out.from && out.to) {
      headers["X-Range-From"] = out.from
      headers["X-Range-To"] = out.to
    }
    return new Response(new Uint8Array(out.buffer), { headers })
  } catch (error) {
    if (error instanceof DatasetError) return errorResponse(error.message, 400)
    console.error("[GET /api/[tenant]/exports]", error)
    return errorResponse("Internal server error", 500)
  }
}
