import { db, prospects } from "@cuik/db"
import { prospectSchema } from "@cuik/shared/validators"
import { loadProspects } from "@/lib/admin/prospects-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** CRM: every prospect with the pipeline figures and the pick lists. */
export async function GET(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    return successResponse(await loadProspects())
  } catch (err) {
    console.error("[GET /api/admin/finance/prospects]", err)
    return errorResponse("Internal server error", 500)
  }
}

export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const body = await request.json().catch(() => null)
    if (!body) return errorResponse("Cuerpo inválido", 400)
    const parsed = prospectSchema.safeParse(body)
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const p = parsed.data
    await db.insert(prospects).values({
      ...p,
      monthlyAmount:
        p.monthlyAmount === null || p.monthlyAmount === undefined ? null : String(p.monthlyAmount),
      createdBy: session.user.id,
    })
    return successResponse(await loadProspects(), 201)
  } catch (err) {
    if ((err as { code?: string })?.code === "23503")
      return errorResponse("El plan o el comercio elegido ya no existe", 400)
    console.error("[POST /api/admin/finance/prospects]", err)
    return errorResponse("Internal server error", 500)
  }
}
