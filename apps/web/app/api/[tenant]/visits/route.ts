import { and, clients, db, desc, eq, member, ne, organization, sql, user, visits } from "@cuik/db"
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
import { cardCompleteNotice } from "@/lib/loyalty/card-complete"
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
      // First issue as the message: the cashier sees "El monto máximo…", not "Validation failed".
      return errorResponse(
        parsed.error.errors[0]?.message ?? "Validation failed",
        400,
        parsed.error.flatten(),
      )
    }

    const result = await registerVisit({
      qrCode: parsed.data.qrCode,
      tenantId: tenant.id,
      cashierId: session.user.id,
      locationId: parsed.data.locationId,
      amount: parsed.data.amount?.toString(),
      source: parsed.data.source,
    })

    const status = result.code === "OK" ? 201 : 200

    // --- Fire-and-forget wallet update after successful visit (stamps + points) ---
    // Only a registered visit changes the pass; a rejected rescan pushes nothing.
    if (result.code === "OK") {
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
        // Stamps: the "tarjeta completa" notice when this visit filled the last
        // stamp (merchant automation), else the milestone notice (null clears a
        // stale one). Points: undefined, so a campaign message is left untouched.
        milestoneMessage:
          isStamps && result.code === "OK"
            ? ((result.cycleComplete
                ? cardCompleteNotice(tenant.automations, {
                    clientName: result.client.name,
                    tenantName: tenant.name,
                    reward: result.rewardValue,
                  })
                : null) ??
              result.milestone?.message ??
              null)
            : undefined,
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

    // Every member of the business (cashiers too) sees every visit: it helps
    // the team check the operation and spot mistakes. Who registered each
    // one is shown when more than one person works the till.
    const conditions = [eq(visits.tenantId, tenant.id)]

    if (date) {
      // The day in the business's own time zone, not UTC: local midnight to
      // local midnight, as UTC bounds (created_at stores UTC), so the
      // (tenant_id, created_at) index still applies.
      const tz = tenant.timezone ?? "America/Lima"
      conditions.push(
        sql`${visits.createdAt} >= ((${date}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'`,
      )
      conditions.push(
        sql`${visits.createdAt} < ((${date}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'`,
      )
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
        bonusKind: visits.bonusKind,
        points: visits.points,
        amount: visits.amount,
        createdAt: visits.createdAt,
        registeredBy: visits.registeredBy,
        registeredByName: user.name,
        clientId: visits.clientId,
        clientName: clients.name,
        clientLastName: clients.lastName,
      })
      .from(visits)
      .innerJoin(clients, eq(visits.clientId, clients.id))
      .leftJoin(user, eq(user.id, visits.registeredBy))
      .where(and(...conditions))
      .orderBy(desc(visits.createdAt))
      .limit(limit)
      .offset(offset)

    const data = rows.map((r) => ({
      id: r.id,
      visitNum: r.visitNum,
      cycleNumber: r.cycleNumber,
      source: r.source,
      bonusKind: r.bonusKind,
      points: r.points,
      amount: r.amount,
      createdAt: r.createdAt,
      registeredBy: r.registeredBy,
      registeredByName: r.registeredByName,
      client: {
        id: r.clientId,
        name: r.clientName,
        lastName: r.clientLastName,
      },
    }))

    // Cashiers of this business: with two or more, each visit says who registered it.
    const [{ people }] = await db
      .select({ people: sql<number>`count(*)::int` })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(
        and(
          eq(organization.slug, tenant.slug), // cashiers are stored as "member" (see tenant-roles-shared)
          ne(member.role, "owner"),
          ne(member.role, "admin"),
        ),
      )

    return successResponse({
      data,
      showRegisteredBy: people >= 2,
      pagination: paginationMeta(total, page, limit),
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/visits]", error)
    return errorResponse("Internal server error", 500)
  }
}
