import { and, clients, db, eq, passInstances } from "@cuik/db"
import {
  errorResponse,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; clientId: string }> },
) {
  try {
    // 1. Auth + tenant resolution
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug, clientId } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // 2. Find client (verify tenant ownership)
    const clientRows = await db
      .select({ id: clients.id, qrCode: clients.qrCode })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)

    const client = clientRows[0]
    if (!client) return errorResponse("Client not found", 404)

    // 3. Query pass_instances for this client
    if (!client.qrCode) {
      return successResponse({
        apple: null,
        google: null,
        hasAnyPass: false,
      })
    }

    const instanceRows = await db
      .select({
        applePassUrl: passInstances.applePassUrl,
        googleSaveUrl: passInstances.googleSaveUrl,
        lastUpdatedAt: passInstances.lastUpdatedAt,
      })
      .from(passInstances)
      .where(eq(passInstances.serialNumber, client.qrCode))
      .limit(1)

    const instance = instanceRows[0]

    if (!instance) {
      return successResponse({
        apple: null,
        google: null,
        hasAnyPass: false,
      })
    }

    return successResponse({
      apple: instance.applePassUrl
        ? {
            url: instance.applePassUrl,
            lastUpdated: instance.lastUpdatedAt?.toISOString() ?? null,
          }
        : null,
      google: instance.googleSaveUrl
        ? {
            url: instance.googleSaveUrl,
            lastUpdated: instance.lastUpdatedAt?.toISOString() ?? null,
          }
        : null,
      hasAnyPass: !!(instance.applePassUrl || instance.googleSaveUrl),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/wallet/status/[clientId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
