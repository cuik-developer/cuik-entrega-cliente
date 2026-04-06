import { and, clients, db, eq, ilike, or, sql } from "@cuik/db"
import { clientSearchSchema } from "@cuik/shared/validators"

import {
  errorResponse,
  paginationMeta,
  parsePagination,
  requireAuth,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import { getClientStatus } from "@/lib/loyalty"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { computeClientSegment, getThresholds } from "@/lib/loyalty/client-segments"

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Resolve segmentation thresholds for this tenant
    const segConfig = tenant.segmentationConfig as Partial<SegmentationThresholds> | null
    const thresholds = getThresholds(tenant.businessType, segConfig)

    const url = new URL(request.url)
    const queryParsed = clientSearchSchema.safeParse(Object.fromEntries(url.searchParams))
    if (!queryParsed.success) {
      return errorResponse("Invalid query parameters", 400, queryParsed.error.flatten())
    }

    const { search, qr, status } = queryParsed.data

    // QR lookup: exact match, return full status
    if (qr) {
      const clientRows = await db
        .select()
        .from(clients)
        .where(and(eq(clients.qrCode, qr), eq(clients.tenantId, tenant.id)))
        .limit(1)

      const client = clientRows[0]
      if (!client) return errorResponse("Client not found", 404)

      const clientStatus = await getClientStatus({
        clientId: client.id,
        tenantId: tenant.id,
        thresholds,
      })
      return successResponse({
        data: clientStatus ? [clientStatus] : [],
        pagination: paginationMeta(1, 1, 1),
      })
    }

    const { page, limit, offset } = parsePagination(url.searchParams)

    const conditions = [eq(clients.tenantId, tenant.id)]

    if (search) {
      const pattern = `%${search}%`
      const searchCondition = or(
        ilike(clients.name, pattern),
        ilike(clients.lastName, pattern),
        ilike(clients.dni, pattern),
        ilike(clients.phone, pattern),
        ilike(clients.email, pattern),
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    if (status) {
      conditions.push(eq(clients.status, status))
    }

    // Count total
    const [{ cnt: total }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(...conditions))

    // Fetch clients with visit frequency data for segment computation
    const rows = await db
      .select({
        id: clients.id,
        name: clients.name,
        lastName: clients.lastName,
        dni: clients.dni,
        phone: clients.phone,
        email: clients.email,
        qrCode: clients.qrCode,
        status: clients.status,
        totalVisits: clients.totalVisits,
        currentCycle: clients.currentCycle,
        tier: clients.tier,
        createdAt: clients.createdAt,
        lastVisitAt: sql<Date | null>`(
          SELECT MAX("created_at") FROM loyalty.visits
          WHERE "client_id" = ${clients.id}
            AND "tenant_id" = ${tenant.id}
        )`,
        avgDaysBetweenVisits: sql<number | null>`(
          SELECT CASE
            WHEN COUNT(*) <= 1 THEN NULL
            ELSE EXTRACT(EPOCH FROM (MAX("created_at") - MIN("created_at")))
              / (COUNT(*) - 1) / 86400.0
          END
          FROM loyalty.visits
          WHERE "client_id" = ${clients.id}
            AND "tenant_id" = ${tenant.id}
        )`,
      })
      .from(clients)
      .where(and(...conditions))
      .orderBy(clients.createdAt)
      .limit(limit)
      .offset(offset)

    const data = rows.map((c) => ({
      id: c.id,
      name: c.name,
      lastName: c.lastName,
      dni: c.dni,
      phone: c.phone,
      email: c.email,
      qrCode: c.qrCode,
      status: c.status,
      totalVisits: c.totalVisits,
      currentCycle: c.currentCycle,
      tier: c.tier,
      createdAt: c.createdAt,
      segment: computeClientSegment(
        {
          createdAt: c.createdAt,
          totalVisits: c.totalVisits,
          lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : null,
          avgDaysBetweenVisits: c.avgDaysBetweenVisits ? Number(c.avgDaysBetweenVisits) : null,
        },
        thresholds,
      ),
    }))

    return successResponse({
      data,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/clients]", error)
    return errorResponse("Internal server error", 500)
  }
}
