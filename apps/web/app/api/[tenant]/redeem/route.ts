import { and, clients, count, db, eq, promotions, rewards } from "@cuik/db"
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

    // The pass shows the pending reward (full strip, "Pídelo en caja", pending
    // count): refresh it now instead of at the next visit.
    if (result.code === "OK") {
      refreshPassAfterStampsRedeem(parsed.data.qrCode, tenant.id, tenant.name).catch((err) => {
        console.error("[POST /api/[tenant]/redeem] Wallet update after stamps redeem failed:", err)
      })
    }

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

async function refreshPassAfterStampsRedeem(qrCode: string, tenantId: string, tenantName: string) {
  const [[client], [promotion]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        lastName: clients.lastName,
        totalVisits: clients.totalVisits,
        pointsBalance: clients.pointsBalance,
      })
      .from(clients)
      .where(and(eq(clients.qrCode, qrCode), eq(clients.tenantId, tenantId)))
      .limit(1),
    db
      .select({ maxVisits: promotions.maxVisits })
      .from(promotions)
      .where(
        and(
          eq(promotions.tenantId, tenantId),
          eq(promotions.type, "stamps"),
          eq(promotions.active, true),
        ),
      )
      .limit(1),
  ])
  if (!client) return
  // Counted now, next to the client read, so a visit landing in between cannot
  // leave the pass showing the wrong number of pending rewards.
  const [pending] = await db
    .select({ cnt: count() })
    .from(rewards)
    .where(
      and(
        eq(rewards.clientId, client.id),
        eq(rewards.tenantId, tenantId),
        eq(rewards.status, "pending"),
      ),
    )
  const pendingRewards = Number(pending?.cnt ?? 0)
  const maxVisits = promotion?.maxVisits ?? 0
  await triggerWalletUpdate({
    qrCode,
    clientId: client.id,
    clientName: `${client.name}${client.lastName ? ` ${client.lastName}` : ""}`,
    tenantId,
    tenantName,
    stampsInCycle: maxVisits > 0 ? client.totalVisits % maxVisits : 0,
    maxVisits,
    totalVisits: client.totalVisits,
    pendingRewards,
    pointsBalance: client.pointsBalance,
    // null drops a milestone / "Tarjeta completa" notice ("Pídelo en caja")
    // and keeps a real campaign message (see nextPassMessage).
    milestoneMessage: null,
  })
}
