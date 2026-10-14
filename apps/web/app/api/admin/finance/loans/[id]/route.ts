import { db, eq, loans } from "@cuik/db"
import { updateLoanSchema } from "@cuik/shared/validators"
import { loadFinance } from "@/lib/admin/finance-data"
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
    const parsed = updateLoanSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const u = parsed.data
    await db
      .update(loans)
      .set({
        ...(u.name !== undefined ? { name: u.name } : {}),
        ...(u.principal !== undefined ? { principal: String(u.principal) } : {}),
        ...(u.currency !== undefined ? { currency: u.currency } : {}),
        ...(u.installment !== undefined ? { installment: String(u.installment) } : {}),
        ...(u.installments !== undefined ? { installments: u.installments } : {}),
        ...(u.firstMonth !== undefined ? { firstMonth: u.firstMonth } : {}),
        ...(u.notes !== undefined ? { notes: u.notes ?? null } : {}),
      })
      .where(eq(loans.id, g.id))
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[PATCH /api/admin/finance/loans/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.delete(loans).where(eq(loans.id, g.id))
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[DELETE /api/admin/finance/loans/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
