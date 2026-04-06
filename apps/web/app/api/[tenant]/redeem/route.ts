import { redeemRewardSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { redeemReward } from "@/lib/loyalty"
import { redeemPoints } from "@/lib/loyalty/redeem-points"

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const body = await request.json()
    const parsed = redeemRewardSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    // If catalogItemId is present → points redemption flow
    if (parsed.data.catalogItemId) {
      const result = await redeemPoints({
        qrCode: parsed.data.qrCode,
        tenantId: tenant.id,
        catalogItemId: parsed.data.catalogItemId,
        cashierId: session.user.id,
      })

      return successResponse(result)
    }

    // Otherwise → existing stamps redemption flow
    const result = await redeemReward({
      qrCode: parsed.data.qrCode,
      tenantId: tenant.id,
      cashierId: session.user.id,
    })

    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/[tenant]/redeem]", error)
    return errorResponse("Internal server error", 500)
  }
}
