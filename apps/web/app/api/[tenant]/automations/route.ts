import { and, db, eq, promotions, tenants } from "@cuik/db"
import {
  automationsConfigSchema,
  pointsPromotionConfigSchema,
  registrationConfigSchema,
  updateAutomationsSchema,
} from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
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
import { describeExpirationPolicy } from "@/lib/loyalty/expiration"
import { getPointsExpiryConfig } from "@/lib/loyalty/expire-points"
import { clientsWithPointsExpiringSoon } from "@/lib/loyalty/points-lots"
import { defaultRecipients, getReportsConfig } from "@/lib/reports/send-report"

/**
 * Points expiration policy of the tenant's active points promotion, as set by
 * the Cuik team. Null when the tenant is not on points or points never expire:
 * the "puntos por vencer" card is hidden in that case.
 */
async function pointsExpiryPolicy(tenantId: string): Promise<string | null> {
  const [promo] = await db
    .select({ config: promotions.config })
    .from(promotions)
    .where(
      and(
        eq(promotions.tenantId, tenantId),
        eq(promotions.type, "points"),
        eq(promotions.active, true),
      ),
    )
    .limit(1)
  if (!promo) return null
  const parsed = pointsPromotionConfigSchema.safeParse(promo.config ?? {})
  if (!parsed.success || parsed.data.points.pointsExpiration.mode === "never") return null
  return describeExpirationPolicy(parsed.data.points.pointsExpiration)
}

/**
 * GET /api/[tenant]/automations
 * Current automation settings (with defaults filled in) plus the numbers the
 * Campañas card shows: birthday coverage, who celebrates today, next 7 days.
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

    const tz = tenant.timezone ?? "America/Lima"
    const date = todayLocal(tz)
    // Each block degrades on its own: a failing query must not take the whole
    // Campañas page down (the card, and the reports card in Analítica, read this).
    const safe = async <T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await run()
      } catch (err) {
        console.error(`[GET /api/[tenant]/automations] ${label} failed:`, err)
        return fallback
      }
    }
    const pointsExpiryConfig = getPointsExpiryConfig(tenant.automations)
    const [coverage, today, upcoming, recipients, expiryPolicy, expiringSoon] = await Promise.all([
      safe("birthdayCoverage", () => birthdayCoverage(tenant.id), { withBirthday: 0, total: 0 }),
      safe("findBirthdayClients", () => findBirthdayClients(tenant.id, date), []),
      safe("upcomingBirthdays", () => upcomingBirthdays(tenant.id, date, 7), []),
      safe("defaultRecipients", () => defaultRecipients(tenant.id), [] as string[]),
      safe("pointsExpiryPolicy", () => pointsExpiryPolicy(tenant.id), null as string | null),
      safe(
        "clientsWithPointsExpiringSoon",
        () => clientsWithPointsExpiringSoon(db, tenant.id, tz, pointsExpiryConfig.daysBefore),
        0,
      ),
    ])
    const regParsed = registrationConfigSchema.safeParse(tenant.registrationConfig ?? {})
    const birthdayAsked = regParsed.success ? regParsed.data.birthday.enabled : false

    return successResponse({
      birthday: {
        config: getBirthdayConfig(tenant.automations),
        coverage,
        today,
        upcoming,
        /** Whether the public registration asks for the birthday (SA → Registro). */
        asked: birthdayAsked,
      },
      pointsExpiry: {
        config: pointsExpiryConfig,
        /** Human label of the policy set by Cuik; null = card hidden (no expiration). */
        policy: expiryPolicy,
        /** Clients holding points that expire within `daysBefore` days. */
        expiringSoon,
      },
      reports: {
        config: getReportsConfig(tenant.automations),
        /** Default list (contact email + owner + admins), used when config.recipients is empty. */
        suggested: recipients,
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

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)
    const membershipError = await requireTenantAdmin(session, tenant.id)
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
              recipients: reportsPatch.recipients ?? currentReports.recipients,
            },
          }
        : {}),
    }

    await db.update(tenants).set({ automations: next }).where(eq(tenants.id, tenant.id))

    return successResponse({
      birthday: getBirthdayConfig(next),
      pointsExpiry: getPointsExpiryConfig(next),
      reports: getReportsConfig(next),
    })
  } catch (error) {
    console.error("[PUT /api/[tenant]/automations]", error)
    return errorResponse("Internal server error", 500)
  }
}
