import { and, clientNotes, clients, db, eq } from "@cuik/db"
import { z } from "zod"
import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

import { getClientStatus } from "@/lib/loyalty"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Basic UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return errorResponse("Invalid client ID format", 400)
    }

    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)
    const status = await getClientStatus({ clientId: id, tenantId: tenant.id, thresholds })
    if (!status) {
      return errorResponse("Client not found", 404)
    }

    return successResponse(status)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}

const patchClientSchema = z.object({
  status: z.enum(["active", "blocked"]),
  reason: z.string().trim().max(500).optional(),
})

/**
 * PATCH /api/[tenant]/clients/[id]  { status: "active" | "blocked", reason? }
 * Blocks or unblocks a client. Admin only. The change is written to the
 * client's notes with who did it and why, so it shows up in the timeline —
 * there is no separate audit table and this keeps the schema untouched.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; id: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug, id } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) return errorResponse("Invalid client ID format", 400)

    const parsed = patchClientSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse("Invalid body", 400, parsed.error.flatten())
    }
    const { status, reason } = parsed.data

    const [current] = await db
      .select({ id: clients.id, status: clients.status })
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.tenantId, tenant.id)))
      .limit(1)
    if (!current) return errorResponse("Client not found", 404)

    if (current.status === status) {
      return successResponse({ id, status, changed: false })
    }

    await db.transaction(async (tx) => {
      await tx.update(clients).set({ status }).where(eq(clients.id, id))
      const action = status === "blocked" ? "Cliente bloqueado" : "Cliente desbloqueado"
      await tx.insert(clientNotes).values({
        clientId: id,
        tenantId: tenant.id,
        createdBy: session.user.id,
        content: reason ? `${action}. Motivo: ${reason}` : action,
      })
    })

    return successResponse({ id, status, changed: true })
  } catch (error) {
    console.error("[PATCH /api/[tenant]/clients/[id]]", error)
    return errorResponse("Internal server error", 500)
  }
}
