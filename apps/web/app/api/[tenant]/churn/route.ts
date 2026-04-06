import { campaignSegments, campaigns, db } from "@cuik/db"
import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { executeCampaign } from "@/lib/campaigns"
import { getAtRiskClientCount, getAtRiskClients } from "@/lib/loyalty/churn-detection"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"

const sendChurnCampaignSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "El mensaje es requerido")
    .max(150, "Apple Wallet trunca mensajes a 150 caracteres"),
})

/**
 * GET /api/[tenant]/churn
 * Returns at-risk client count and list.
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

    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)
    const atRiskClients = await getAtRiskClients(tenant.id, thresholds)

    return successResponse({
      count: atRiskClients.length,
      clients: atRiskClients.map((c) => ({
        id: c.id,
        name: c.name,
        lastName: c.lastName,
        lastVisitAt: c.lastVisitAt,
        avgDays: c.avgDays,
        daysSinceLastVisit: c.daysSinceLastVisit,
      })),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/churn]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/[tenant]/churn
 * Creates and immediately executes a push campaign targeting at-risk clients.
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

    const body = await request.json()
    const parsed = sendChurnCampaignSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    // Verify there are at-risk clients
    const segConfigPost = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholdsPost = getThresholds(tenant.businessType, segConfigPost)
    const count = await getAtRiskClientCount(tenant.id, thresholdsPost)
    if (count === 0) {
      return errorResponse("No hay clientes en riesgo actualmente", 400)
    }

    // Create campaign
    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: tenant.id,
        name: `Recuperacion de clientes — ${new Date().toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}`,
        type: "push",
        message: parsed.data.message,
        status: "draft",
        createdBy: session.user.id,
      })
      .returning()

    // Create segment with en_riesgo preset
    // The resolve-segment system will need to handle this preset
    // For now, we use a custom filter that matches the at-risk logic
    await db.insert(campaignSegments).values({
      campaignId: campaign.id,
      segmentName: "en_riesgo",
      filter: { preset: "en_riesgo" },
    })

    // Execute immediately
    const result = await executeCampaign(campaign.id)

    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/[tenant]/churn]", error)
    return errorResponse("Internal server error", 500)
  }
}
