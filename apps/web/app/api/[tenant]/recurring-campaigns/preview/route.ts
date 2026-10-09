import { recurrenceRuleSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { describeRecurrence, nextOccurrences } from "@/lib/campaigns/recurrence"

/** "Próximos envíos" preview while the admin fills the form. Pure, no writes. */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantAdmin(session, tenant.id)
    if (membershipError) return membershipError

    const parsed = recurrenceRuleSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const timezone = tenant.timezone ?? "America/Lima"
    const next = nextOccurrences(parsed.data, new Date(), timezone, 4)
    return successResponse({
      description: describeRecurrence(parsed.data),
      next: next.map((d) => d.toISOString()),
    })
  } catch (error) {
    console.error("[POST /api/[tenant]/recurring-campaigns/preview]", error)
    return errorResponse("Internal server error", 500)
  }
}
