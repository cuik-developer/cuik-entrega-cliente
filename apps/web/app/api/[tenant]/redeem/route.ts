import { and, clients, db, eq } from "@cuik/db"
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
import { triggerWalletUpdate } from "@/lib/wallet/trigger-wallet-update"

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

      // The balance changed: refresh the pass (ETag + Apple push + Google upsert),
      // fire-and-forget like the visits route does. Without this the card kept
      // showing the old balance until the next visit.
      if (result.code === "OK") {
        refreshPassAfterRedeem(parsed.data.qrCode, tenant.id, tenant.name).catch((err) => {
          console.error("[POST /api/[tenant]/redeem] Wallet update failed:", err)
        })
      }

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

async function refreshPassAfterRedeem(qrCode: string, tenantId: string, tenantName: string) {
  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      totalVisits: clients.totalVisits,
      pointsBalance: clients.pointsBalance,
    })
    .from(clients)
    .where(and(eq(clients.qrCode, qrCode), eq(clients.tenantId, tenantId)))
    .limit(1)
  if (!client) return
  await triggerWalletUpdate({
    qrCode,
    clientId: client.id,
    clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
    tenantId,
    tenantName,
    stampsInCycle: 0,
    maxVisits: 0,
    totalVisits: client.totalVisits,
    pendingRewards: 0,
    pointsBalance: client.pointsBalance,
  })
}
