import { db, eq, financeEntries } from "@cuik/db"
import { updateFinanceEntrySchema } from "@cuik/shared/validators"
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
    const parsed = updateFinanceEntrySchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const u = parsed.data
    await db
      .update(financeEntries)
      .set({
        ...(u.type !== undefined ? { type: u.type } : {}),
        ...(u.category !== undefined ? { category: u.category } : {}),
        ...(u.name !== undefined ? { name: u.name } : {}),
        ...(u.amount !== undefined ? { amount: String(u.amount) } : {}),
        ...(u.currency !== undefined ? { currency: u.currency } : {}),
        ...(u.month !== undefined ? { month: u.month } : {}),
        ...(u.months !== undefined ? { months: u.months } : {}),
        ...(u.recognition !== undefined ? { recognition: u.recognition } : {}),
        ...(u.tenantId !== undefined ? { tenantId: u.tenantId ?? null } : {}),
        ...(u.notes !== undefined ? { notes: u.notes ?? null } : {}),
      })
      .where(eq(financeEntries.id, g.id))
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[PATCH /api/admin/finance/entries/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.delete(financeEntries).where(eq(financeEntries.id, g.id))
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[DELETE /api/admin/finance/entries/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
