import { and, clients, db, desc, eq, sql, visits } from "@cuik/db"
import { registerVisitSchema, visitHistorySchema } from "@cuik/shared/validators"

import {
  errorResponse,
  paginationMeta,
  parsePagination,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { registerVisit } from "@/lib/loyalty"
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
    const parsed = registerVisitSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const result = await registerVisit({
      qrCode: parsed.data.qrCode,
      tenantId: tenant.id,
      cashierId: session.user.id,
      locationId: parsed.data.locationId,
      amount: parsed.data.amount?.toString(),
    })

    const status = result.code === "OK" ? 201 : 200

    // --- Fire-and-forget wallet update after successful visit (stamps + points) ---
    if (result.code === "OK" || result.code === "ALREADY_SCANNED_TODAY") {
      const isStamps = "stamps" in result
      triggerWalletUpdate({
        qrCode: parsed.data.qrCode,
        clientId: result.client.id,
        clientName: `${result.client.name}${result.client.lastName ? ` ${result.client.lastName}` : ""}`,
        tenantId: tenant.id,
        tenantName: tenant.name,
        stampsInCycle: isStamps ? result.stamps.current : 0,
        maxVisits: isStamps ? result.stamps.max : 0,
        totalVisits: result.client.totalVisits,
        pendingRewards: isStamps ? result.pendingRewards : 0,
        pointsBalance: "pointsBalance" in result.client ? result.client.pointsBalance : 0,
      }).catch((err) => {
        console.error("[POST /api/[tenant]/visits] Wallet update failed:", err)
      })
    }

    return successResponse(result, status)
  } catch (error) {
    console.error("[POST /api/[tenant]/visits]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const url = new URL(request.url)
    const queryParsed = visitHistorySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!queryParsed.success) {
      return errorResponse("Invalid query parameters", 400, queryParsed.error.flatten())
    }

    const { page, limit, offset } = parsePagination(url.searchParams)
    const { date, clientId } = queryParsed.data

    // Role-based filtering: cajero sees only own visits
    const userRole = (session.user as { role?: string }).role ?? "user"
    const isAdmin = userRole === "admin" || userRole === "super_admin"

    const conditions = [eq(visits.tenantId, tenant.id)]

    if (!isAdmin) {
      conditions.push(eq(visits.registeredBy, session.user.id))
    }

    if (date) {
      const dayStart = new Date(`${date}T00:00:00.000Z`)
      const dayEnd = new Date(`${date}T23:59:59.999Z`)
      conditions.push(sql`${visits.createdAt} >= ${dayStart.toISOString()}`)
      conditions.push(sql`${visits.createdAt} <= ${dayEnd.toISOString()}`)
    }

    if (clientId) {
      conditions.push(eq(visits.clientId, clientId))
    }

    // Count total
    const [{ cnt: total }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(...conditions))

    // Fetch visits with client join
    const rows = await db
      .select({
        id: visits.id,
        visitNum: visits.visitNum,
        cycleNumber: visits.cycleNumber,
        source: visits.source,
        createdAt: visits.createdAt,
        registeredBy: visits.registeredBy,
        clientId: visits.clientId,
        clientName: clients.name,
        clientLastName: clients.lastName,
      })
      .from(visits)
      .innerJoin(clients, eq(visits.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(visits.createdAt))
      .limit(limit)
      .offset(offset)

    const data = rows.map((r) => ({
      id: r.id,
      visitNum: r.visitNum,
      cycleNumber: r.cycleNumber,
      source: r.source,
      createdAt: r.createdAt,
      registeredBy: r.registeredBy,
      client: {
        id: r.clientId,
        name: r.clientName,
        lastName: r.clientLastName,
      },
    }))

    return successResponse({
      data,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/visits]", error)
    return errorResponse("Internal server error", 500)
  }
}
