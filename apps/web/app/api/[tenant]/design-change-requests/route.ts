import { db, designChangeRequests } from "@cuik/db"
import { CambioPaseSolicitado, sendEmail } from "@cuik/email"
import { createDesignChangeRequestSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const body = await request.json()
    const parsed = createDesignChangeRequestSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const [created] = await db
      .insert(designChangeRequests)
      .values({
        tenantId: tenant.id,
        requestedByUserId: session.user.id,
        type: parsed.data.type,
        message: parsed.data.message,
      })
      .returning()

    // Notify SA (fire-and-forget). Never block the user response on email.
    const sessionUser = session.user as { id: string; name?: string; email?: string }
    const saEmail = process.env.SA_EMAIL || "sa@cuik.app"
    sendEmail({
      to: saEmail,
      subject: `Solicitud de cambios — ${tenant.name}`,
      template: CambioPaseSolicitado({
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        requestedByName: sessionUser.name ?? "Sin nombre",
        requestedByEmail: sessionUser.email ?? "—",
        type: created.type,
        message: created.message,
        requestId: created.id,
      }),
    }).catch((err) =>
      console.error("[EMAIL] Failed to send design-change-request notification:", err),
    )

    return successResponse(created, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/design-change-requests]", error)
    return errorResponse("Internal server error", 500)
  }
}
