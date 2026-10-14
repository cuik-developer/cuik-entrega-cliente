import { db, eq, prospects } from "@cuik/db"
import { updateProspectSchema } from "@cuik/shared/validators"
import { loadProspects } from "@/lib/admin/prospects-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

async function guard(request: Request, ctx: Ctx) {
  const { session, error } = await requireAuth(request)
  if (error) return { error }
  const roleError = requireRole(session, "super_admin")
  if (roleError) return { error: roleError }
  const { id } = await ctx.params
  if (!UUID.test(id)) return { error: errorResponse("Not found", 404) }
  return { id }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const body = await request.json().catch(() => null)
    if (!body) return errorResponse("Cuerpo inválido", 400)
    const parsed = updateProspectSchema.safeParse(body)
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const u = parsed.data
    const [row] = await db.select().from(prospects).where(eq(prospects.id, g.id)).limit(1)
    if (!row) return errorResponse("Not found", 404)
    const { monthlyAmount, ...rest } = u
    await db
      .update(prospects)
      .set({
        ...rest,
        ...(monthlyAmount !== undefined
          ? { monthlyAmount: monthlyAmount === null ? null : String(monthlyAmount) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, g.id))
    return successResponse(await loadProspects())
  } catch (err) {
    if ((err as { code?: string })?.code === "23503")
      return errorResponse("El plan o el comercio elegido ya no existe", 400)
    console.error("[PATCH /api/admin/finance/prospects/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.delete(prospects).where(eq(prospects.id, g.id))
    return successResponse(await loadProspects())
  } catch (err) {
    console.error("[DELETE /api/admin/finance/prospects/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
