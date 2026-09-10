import { db, eq, tenants } from "@cuik/db"
import { automationsConfigSchema, updateAutomationsSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import {
  birthdayCoverage,
  findBirthdayClients,
  getBirthdayConfig,
  todayLocal,
  upcomingBirthdays,
} from "@/lib/campaigns/birthday"

/**
 * GET /api/[tenant]/automations
 * Current automation settings (with defaults filled in) plus the numbers the
 * Campañas card shows: birthday coverage, who celebrates today, next 7 days.
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

    const tz = tenant.timezone ?? "America/Lima"
    const date = todayLocal(tz)
    const [coverage, today, upcoming] = await Promise.all([
      birthdayCoverage(tenant.id),
      findBirthdayClients(tenant.id, date),
      upcomingBirthdays(tenant.id, date, 7),
    ])

    return successResponse({
      birthday: {
        config: getBirthdayConfig(tenant.automations),
        coverage,
        today,
        upcoming,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/automations]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * PUT /api/[tenant]/automations  { birthday: { enabled, message, sendHour } }
 * Merges the given automation(s) into tenants.automations.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
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

    const parsed = updateAutomationsSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const currentParsed = automationsConfigSchema.safeParse(tenant.automations ?? {})
    const current = currentParsed.success ? currentParsed.data : {}
    const next = { ...current, ...parsed.data }

    await db.update(tenants).set({ automations: next }).where(eq(tenants.id, tenant.id))

    return successResponse({ birthday: getBirthdayConfig(next) })
  } catch (error) {
    console.error("[PUT /api/[tenant]/automations]", error)
    return errorResponse("Internal server error", 500)
  }
}
