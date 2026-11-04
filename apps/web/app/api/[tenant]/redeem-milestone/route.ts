import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { redeemMilestone } from "@/lib/loyalty/redeem-milestone"
import { refreshStampsPass } from "@/lib/wallet/refresh-stamps-pass"

const bodySchema = z.object({ qrCode: z.string().trim().min(1) })

/**
 * POST /api/[tenant]/redeem-milestone { qrCode }
 * Early cash-out of the redeemable milestone ("escalera canjeable"). Any member
 * of the till can do it, like a regular redeem.
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

    const result = await redeemMilestone({
      qrCode: parsed.data.qrCode,
      tenantId: tenant.id,
      cashierId: session.user.id,
    })

    // The card dropped by the cashed stamps: redraw the pass now.
    if (result.code === "OK") {
      refreshStampsPass(parsed.data.qrCode, tenant.id, tenant.name).catch((err) => {
        console.error("[POST /api/[tenant]/redeem-milestone] Wallet update failed:", err)
      })
    }

    return successResponse(result)
  } catch (error) {
    console.error("[POST /api/[tenant]/redeem-milestone]", error)
    return errorResponse("Internal server error", 500)
  }
}
