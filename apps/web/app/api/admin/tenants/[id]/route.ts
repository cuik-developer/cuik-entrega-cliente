import { and, db, eq, ne, plans, tenants } from "@cuik/db"
import { updateTenantSchema } from "@cuik/shared/validators"
import type { z } from "zod"
import { billingOutlookFor } from "@/lib/admin/billing-overview"
import { enrichTenantRows, invalidateTenantSummary } from "@/lib/admin/tenant-summary"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

// ── Helpers ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function validateSlugUniqueness(slug: string, currentSlug: string, tenantId: string) {
  if (slug === currentSlug) return null
  const slugTaken = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), ne(tenants.id, tenantId)))
    .limit(1)
  if (slugTaken.length > 0) {
    return errorResponse("Slug already taken by another tenant", 409)
  }
  return null
}

async function validatePlanExists(planId: string) {
  const planExists = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1)
  if (planExists.length === 0) {
    return errorResponse("Plan not found", 400)
  }
  return null
}

function buildUpdateData(
  data: z.infer<typeof updateTenantSchema>,
  existingStatus: string,
): Record<string, unknown> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() }

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.status !== undefined) {
    updateData.status = data.status
    if (data.status === "active" && existingStatus !== "active") {
      updateData.activatedAt = new Date()
    }
  }
  if (data.planId !== undefined) updateData.planId = data.planId
  if (data.trialEndsAt !== undefined) updateData.trialEndsAt = new Date(data.trialEndsAt)
  if (data.businessType !== undefined) updateData.businessType = data.businessType || null
  if (data.address !== undefined) updateData.address = data.address || null
  if (data.phone !== undefined) updateData.phone = data.phone || null
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail || null
  if (data.timezone !== undefined) updateData.timezone = data.timezone
  if (data.segmentationConfig !== undefined) updateData.segmentationConfig = data.segmentationConfig

  return updateData
}

// ── Route Handler ───────────────────────────────────────────────────

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse("Tenant not found", 404)
    const body = await request.json()
    const parsed = updateTenantSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const [existing] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!existing) {
      return errorResponse("Tenant not found", 404)
    }

    if (parsed.data.slug !== undefined) {
      const slugError = await validateSlugUniqueness(parsed.data.slug, existing.slug, id)
      if (slugError) return slugError
    }

    if (parsed.data.planId !== undefined) {
      const planError = await validatePlanExists(parsed.data.planId)
      if (planError) return planError
    }

    const updateData = buildUpdateData(parsed.data, existing.status)
    const [updated] = await db.update(tenants).set(updateData).where(eq(tenants.id, id)).returning()
    invalidateTenantSummary(id)

    return successResponse(updated)
  } catch (error) {
    console.error("[PATCH /api/admin/tenants/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** One tenant with the same counts and health the list shows (detail page). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse("Tenant not found", 404)

    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        planId: tenants.planId,
        trialEndsAt: tenants.trialEndsAt,
        activatedAt: tenants.activatedAt,
        ownerId: tenants.ownerId,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
        branding: tenants.branding,
        businessType: tenants.businessType,
        address: tenants.address,
        phone: tenants.phone,
        contactEmail: tenants.contactEmail,
        timezone: tenants.timezone,
        segmentationConfig: tenants.segmentationConfig,
        appleConfig: tenants.appleConfig,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
    if (rows.length === 0) return errorResponse("Tenant not found", 404)

    const [[item], billingMap] = await Promise.all([
      enrichTenantRows(rows),
      billingOutlookFor([id]),
    ])
    const b = billingMap.get(id)
    return successResponse({
      ...item,
      billing: b
        ? {
            status: b.status,
            nextDue: b.nextDue,
            daysUntilNext: b.daysUntilNext,
            daysOverdue: b.daysOverdue,
            monthsOfService: b.monthsOfService,
            monthlyAmount: b.monthlyAmount,
            currency: b.currency,
            serviceStartOn: b.serviceStartOn,
          }
        : null,
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
