import { z } from "zod"

import { computeTenantTrend } from "@/lib/analytics/tenant-trend"
import { MAX_RANGE_DAYS, rangeDays } from "@/lib/analytics/trend-buckets"
import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

const querySchema = z
  .object({
    from: z.string().date("Invalid date format for 'from'"),
    to: z.string().date("Invalid date format for 'to'"),
    granularity: z.enum(["day", "week", "month"]).default("day"),
    locationId: z.string().uuid("Invalid location ID").optional(),
  })
  .refine((q) => q.from <= q.to, { message: "from date must be before to date", path: ["from"] })
  .refine((q) => rangeDays(q.from, q.to) <= MAX_RANGE_DAYS[q.granularity], {
    message: "Range too long for this granularity",
    path: ["to"],
  })

/**
 * GET /api/[tenant]/analytics/trend?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month[&locationId]
 *
 * Zero-filled series (visits, new clients, redemptions, points earned when the
 * program is points) bucketed in the tenant timezone. Range caps: 366 days
 * for `day`, 731 for `week`, 1827 for `month`. Super-admin read-only view is
 * allowed (requireTenantAdmin accepts session.saViewTenantId).
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

    const url = new URL(request.url)
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return errorResponse("Invalid query parameters", 400, parsed.error.flatten())
    }

    const data = await computeTenantTrend(tenant.id, {
      ...parsed.data,
      timezone: tenant.timezone,
    })
    return successResponse(data)
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/trend]", error)
    return errorResponse("Internal server error", 500)
  }
}
