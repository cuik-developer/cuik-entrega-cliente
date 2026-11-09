import { db, eq, tenants } from "@cuik/db"
import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { createProgramPhase, listProgramPhases } from "@/lib/loyalty/program-phases"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const createPhaseSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre de la etapa").max(80),
  startsOn: z.string().date("Fecha inválida"),
  note: z.string().trim().max(2000).nullable().optional(),
})

/**
 * GET /api/admin/tenants/[id]/phases — program phases of a tenant (newest
 * first), each with the baseline snapshot taken when it was created.
 * Super-admin only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)

    return successResponse(await listProgramPhases(id))
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/phases]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/admin/tenants/[id]/phases { name, startsOn, note? } — marks a new
 * stage of the program and snapshots the baseline right now.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const parsed = createPhaseSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors[0]?.message ?? "Validation failed",
        400,
        parsed.error.flatten(),
      )
    }

    const created = await createProgramPhase({
      tenantId: id,
      name: parsed.data.name,
      startsOn: parsed.data.startsOn,
      note: parsed.data.note ?? null,
      createdBy: session.user.id,
    })
    return successResponse(created, 201)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/phases]", error)
    return errorResponse("Internal server error", 500)
  }
}
