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
import { getReportsConfig, reportRecipients } from "@/lib/reports/send-report"

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
    const [coverage, today, upcoming, recipients] = await Promise.all([
      birthdayCoverage(tenant.id),
      findBirthdayClients(tenant.id, date),
      upcomingBirthdays(tenant.id, date, 7),
      reportRecipients(tenant.id),
    ])

    return successResponse({
      birthday: {
        config: getBirthdayConfig(tenant.automations),
        coverage,
        today,
        upcoming,
      },
      reports: {
        config: getReportsConfig(tenant.automations),
        recipients,
        myEmail: session.user.email ?? null,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/automations]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * PUT /api/[tenant]/automations
 *   { birthday: { enabled, message, sendHour } }
 *   { reports: { weekly?: { enabled, dayOfWeek, sendHour }, monthly?: { enabled, dayOfMonth, sendHour } } }
 * Merges the given automation(s) into tenants.automations. Report updates keep
 * the stored lastSentPeriod so re-saving never re-sends a period.
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
    const { reports: reportsPatch, ...rest } = parsed.data
    const currentReports = getReportsConfig(current)
    const next = {
      ...current,
      ...rest,
      ...(reportsPatch
        ? {
            reports: {
              weekly: reportsPatch.weekly
                ? { ...currentReports.weekly, ...reportsPatch.weekly }
                : currentReports.weekly,
              monthly: reportsPatch.monthly
                ? { ...currentReports.monthly, ...reportsPatch.monthly }
                : currentReports.monthly,
            },
          }
        : {}),
    }

    await db.update(tenants).set({ automations: next }).where(eq(tenants.id, tenant.id))

    return successResponse({ birthday: getBirthdayConfig(next), reports: getReportsConfig(next) })
  } catch (error) {
    console.error("[PUT /api/[tenant]/automations]", error)
    return errorResponse("Internal server error", 500)
  }
}
