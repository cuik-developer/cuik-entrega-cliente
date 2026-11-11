import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { addDays, fileCoverageTo, getConnection, saveConnection } from "@/lib/pos/sync"
import { connectionSchema } from "./connection-schema"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/admin/tenants/[id]/pos — the tenant's POS connection (no secret)
 * and the start date to suggest (the day after the last file upload).
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const [connection, coveredTo] = await Promise.all([getConnection(id), fileCoverageTo(id)])
    return successResponse({
      connection,
      suggestedStartDate: coveredTo ? addDays(coveredTo, 1) : null,
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/pos]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** PUT /api/admin/tenants/[id]/pos — create or update the connection. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const parsed = connectionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return errorResponse(first?.message ?? "Validation failed", 400, parsed.error.flatten())
    }
    const existing = await getConnection(id)
    const apiKey = parsed.data.apiKey || undefined
    if (!apiKey && !existing?.hasApiKey) return errorResponse("Falta la API key", 400)
    const saved = await saveConnection({
      tenantId: id,
      baseUrl: parsed.data.baseUrl,
      database: parsed.data.database,
      login: parsed.data.login,
      apiKey,
      startDate: parsed.data.startDate,
      enabled: parsed.data.enabled,
      retentionDays: parsed.data.retentionDays,
      excludedDnis: parsed.data.excludedDnis,
      userId: session.user.id,
    })
    if ("error" in saved) return errorResponse(saved.error, 409)
    return successResponse(saved)
  } catch (error) {
    console.error("[PUT /api/admin/tenants/[id]/pos]", error)
    return errorResponse("Internal server error", 500)
  }
}
