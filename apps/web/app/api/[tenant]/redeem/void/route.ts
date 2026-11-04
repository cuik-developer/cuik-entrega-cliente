import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireTenantAdmin,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { voidRedemption } from "@/lib/loyalty/void-redemption"
import { refreshStampsPass } from "@/lib/wallet/refresh-stamps-pass"

const bodySchema = z.object({
  rewardId: z.string().uuid(),
  reason: z.string().trim().min(3, "Indica el motivo").max(200),
})

/**
 * POST /api/[tenant]/redeem/void { rewardId, reason }
 * Undoes a stamps redemption right after it (see voidRedemption): the person
 * who redeemed it, or an admin of the tenant.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const canVoidAny = (await requireTenantAdmin(session, tenant.id)) === null

    const result = await voidRedemption({
      rewardId: parsed.data.rewardId,
      tenantId: tenant.id,
      userId: session.user.id,
      canVoidAny,
      reason: parsed.data.reason,
    })

    // Stamps given back or the reward pending again: redraw the pass now.
    if (result.code === "OK" && result.qrCode) {
      refreshStampsPass(result.qrCode, tenant.id, tenant.name).catch((err) => {
        console.error("[POST /api/[tenant]/redeem/void] Wallet update failed:", err)
      })
    }

    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/[tenant]/redeem/void]", error)
    return errorResponse("Internal server error", 500)
  }
}
