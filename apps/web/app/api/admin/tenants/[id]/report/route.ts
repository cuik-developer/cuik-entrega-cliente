import { db, eq, tenants } from "@cuik/db"
import { z } from "zod"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { todayLocal } from "@/lib/campaigns/birthday"
import { buildReportXlsx, reportFilename } from "@/lib/reports/build-excel"
import { computeReport } from "@/lib/reports/compute-report"
import { sendReport } from "@/lib/reports/send-report"

/**
 * Super-admin access to a tenant's periodic report without going through the
 * merchant panel (and without emailing the merchant):
 *   GET  /api/admin/tenants/[id]/report?kind=weekly|monthly  → the xlsx, as a download
 *   POST /api/admin/tenants/[id]/report { kind }             → emails it to the super-admin
 * Neither marks the period as sent, so the scheduled report is unaffected.
 */

const kindSchema = z.enum(["weekly", "monthly"])

async function loadTenant(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const rows = await db
    .select({ id: tenants.id, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    const kind = kindSchema.safeParse(new URL(request.url).searchParams.get("kind") ?? "weekly")
    if (!kind.success) return errorResponse("kind must be weekly or monthly", 400)

    const tenant = await loadTenant(id)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const data = await computeReport({
      tenantId: tenant.id,
      kind: kind.data,
      todayLocal: todayLocal(tenant.timezone ?? "America/Lima"),
    })
    const xlsx = await buildReportXlsx(data)
    return new Response(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${reportFilename(data)}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/report]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    const body = z.object({ kind: kindSchema }).safeParse(await request.json().catch(() => null))
    if (!body.success) return errorResponse("Validation failed", 400, body.error.flatten())

    const tenant = await loadTenant(id)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const to = session.user.email
    if (!to) return errorResponse("No email to send to", 400)

    const result = await sendReport({ tenantId: tenant.id, kind: body.data.kind, to: [to] })
    if (result.status === "error") return errorResponse(result.error, 502)
    if (result.status === "skipped") return errorResponse(`No se envió: ${result.reason}`, 409)
    return successResponse({ to: result.to, subject: result.subject, period: result.period })
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/report]", error)
    return errorResponse("Internal server error", 500)
  }
}
