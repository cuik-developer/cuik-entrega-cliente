import {
  and,
  appleDevices,
  clients,
  db,
  desc,
  eq,
  passDesigns,
  passInstances,
  promotions,
  sql,
  visits,
} from "@cuik/db"
import { registerVisitSchema, visitHistorySchema } from "@cuik/shared/validators"
import { buildGoogleClassId, getGoogleAccessToken } from "@cuik/wallet/google"
import {
  generateETag,
  resolvePassFields,
  type TemplateContext,
  updateWalletAfterVisit,
  validateAppleApnsEnv,
  validateGoogleEnv,
} from "@cuik/wallet/shared"

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
import { getTenantAppleConfig } from "@/lib/wallet/tenant-apple-config"

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

/**
 * Non-blocking wallet update after visit registration.
 * Updates both Apple (APNs push) and Google (loyalty object upsert).
 * Never throws to the caller.
 */
async function triggerWalletUpdate(ctx: {
  qrCode: string
  clientId: string
  clientName: string
  tenantId: string
  tenantName: string
  stampsInCycle: number
  maxVisits: number
  totalVisits: number
  pendingRewards: number
  pointsBalance: number
}): Promise<void> {
  const serialNumber = ctx.qrCode

  // Find pass_instances for this client
  const instanceRows = await db
    .select({
      id: passInstances.id,
      serialNumber: passInstances.serialNumber,
    })
    .from(passInstances)
    .where(eq(passInstances.serialNumber, serialNumber))
    .limit(1)

  if (instanceRows.length === 0) return // No pass instance — nothing to update

  // Update ETag and lastUpdatedAt
  const now = new Date()
  const etag = generateETag(serialNumber, ctx.totalVisits, now)
  await db
    .update(passInstances)
    .set({ etag, lastUpdatedAt: now })
    .where(eq(passInstances.serialNumber, serialNumber))

  // Get active promotion type for loyalty label
  const [activePromotion] = await db
    .select({ type: promotions.type })
    .from(promotions)
    .where(and(eq(promotions.tenantId, ctx.tenantId), eq(promotions.active, true)))
    .limit(1)

  // Load active design + resolve fields for wallet update
  let resolvedDesignFields: ReturnType<typeof resolvePassFields> | undefined
  try {
    const [activeDesign] = await db
      .select({ fields: passDesigns.fields })
      .from(passDesigns)
      .where(and(eq(passDesigns.tenantId, ctx.tenantId), eq(passDesigns.isActive, true)))
      .limit(1)

    const designFieldsRaw = activeDesign?.fields as {
      headerFields?: Array<{ key: string; label: string; value: string }>
      secondaryFields?: Array<{ key: string; label: string; value: string }>
      backFields?: Array<{ key: string; label: string; value: string }>
    } | null

    if (
      designFieldsRaw &&
      (designFieldsRaw.headerFields?.length ||
        designFieldsRaw.secondaryFields?.length ||
        designFieldsRaw.backFields?.length)
    ) {
      const templateContext: TemplateContext = {
        client: {
          name: ctx.clientName,
          totalVisits: ctx.totalVisits,
          pointsBalance: ctx.pointsBalance,
        },
        stamps: {
          current: ctx.stampsInCycle,
          max: ctx.maxVisits,
          remaining: ctx.maxVisits - ctx.stampsInCycle,
          total: ctx.totalVisits,
        },
        points: {
          balance: ctx.pointsBalance,
        },
        rewards: {
          pending: ctx.pendingRewards,
        },
        tenant: {
          name: ctx.tenantName,
        },
      }
      resolvedDesignFields = resolvePassFields(designFieldsRaw, templateContext)
    }
  } catch (err) {
    console.warn("[Wallet:VisitUpdate] Failed to resolve design fields, using fallback:", err)
  }

  // Build Apple config
  let appleParams: {
    deviceTokens: string[]
    passTypeId: string
    p8KeyPem: string
    teamId: string
    keyId: string
  } | null = null

  const apnsConfig = validateAppleApnsEnv()
  const tenantAppleConfig = await getTenantAppleConfig(ctx.tenantId)
  if (apnsConfig) {
    // Query registered Apple devices for this serial
    const deviceRows = await db
      .select({ pushToken: appleDevices.pushToken })
      .from(appleDevices)
      .where(eq(appleDevices.serialNumber, serialNumber))

    const tokens = deviceRows.map((r) => r.pushToken).filter((t): t is string => !!t)

    if (tokens.length > 0) {
      appleParams = {
        deviceTokens: tokens,
        passTypeId: tenantAppleConfig?.passTypeId ?? apnsConfig.topic,
        p8KeyPem: Buffer.from(apnsConfig.p8Base64, "base64").toString("utf-8"),
        teamId: apnsConfig.teamId,
        keyId: apnsConfig.keyId,
      }
    }
  }

  // Build Google config
  let googleParams: {
    issuerId: string
    classId: string
    accessToken: string
    qrValue: string
  } | null = null

  const googleConfig = validateGoogleEnv()
  if (googleConfig) {
    try {
      const accessToken = await getGoogleAccessToken(googleConfig)
      const classId = buildGoogleClassId(googleConfig.issuerId, ctx.tenantName)

      googleParams = {
        issuerId: googleConfig.issuerId,
        classId,
        accessToken,
        qrValue: serialNumber,
      }
    } catch (err) {
      console.error("[Wallet:Google] Failed to get access token for visit update:", err)
    }
  }

  // Fire the update
  const walletResult = await updateWalletAfterVisit({
    clientId: ctx.clientId,
    tenantId: ctx.tenantId,
    serialNumber,
    stampsInCycle: ctx.stampsInCycle,
    maxVisits: ctx.maxVisits,
    totalVisits: ctx.totalVisits,
    hasReward: ctx.pendingRewards > 0,
    rewardRedeemed: false,
    clientName: ctx.clientName,
    apple: appleParams,
    google: googleParams,
    promotionType: activePromotion?.type,
    designFields: resolvedDesignFields,
  })

  console.info(
    `[Wallet:VisitUpdate] serial=${serialNumber}`,
    `apple=${"skipped" in walletResult.apple ? "skipped" : `${walletResult.apple.sent}/${walletResult.apple.total}`}`,
    `google=${"skipped" in walletResult.google ? "skipped" : walletResult.google.ok ? "ok" : "failed"}`,
  )
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
