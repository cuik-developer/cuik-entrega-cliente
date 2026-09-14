import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { sendReport } from "@/lib/reports/send-report"

const bodySchema = z.object({
  kind: z.enum(["weekly", "monthly"]),
  /** Where to send the test. Defaults to the signed-in admin's email. */
  to: z.string().email().optional(),
})

/**
 * POST /api/[tenant]/reports/send  { kind, to? }
 * "Enviarme una prueba ahora": sends the last closed period's report to one
 * address. Never marks the period as sent, so the scheduled report still goes
 * out to everyone.
 */
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

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const to = parsed.data.to ?? session.user.email
    if (!to) return errorResponse("No email to send to", 400)

    const result = await sendReport({ tenantId: tenant.id, kind: parsed.data.kind, to: [to] })
    if (result.status === "error") return errorResponse(result.error, 502)
    if (result.status === "skipped") return errorResponse(`No se envió: ${result.reason}`, 409)
    return successResponse({ to: result.to, subject: result.subject, period: result.period })
  } catch (error) {
    console.error("[POST /api/[tenant]/reports/send]", error)
    return errorResponse("Internal server error", 500)
  }
}
