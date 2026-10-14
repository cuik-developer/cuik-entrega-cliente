import { db, eq, recurringItems } from "@cuik/db"
import { updateRecurringItemSchema } from "@cuik/shared/validators"
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
    const parsed = updateRecurringItemSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const u = parsed.data
    const [row] = await db.select().from(recurringItems).where(eq(recurringItems.id, g.id)).limit(1)
    if (!row) return errorResponse("Not found", 404)
    const fromMonth = u.fromMonth ?? row.fromMonth
    const toMonth = u.toMonth === undefined ? row.toMonth : (u.toMonth ?? null)
    if (toMonth && toMonth < fromMonth)
      return errorResponse("El mes final es anterior al inicial", 400)
    await db
      .update(recurringItems)
      .set({
        ...(u.type !== undefined ? { type: u.type } : {}),
        ...(u.category !== undefined ? { category: u.category } : {}),
        ...(u.name !== undefined ? { name: u.name } : {}),
        ...(u.amount !== undefined ? { amount: String(u.amount) } : {}),
        ...(u.currency !== undefined ? { currency: u.currency } : {}),
        ...(u.everyMonths !== undefined ? { everyMonths: u.everyMonths } : {}),
        ...(u.fromMonth !== undefined ? { fromMonth: u.fromMonth } : {}),
        ...(u.toMonth !== undefined ? { toMonth: u.toMonth ?? null } : {}),
        ...(u.recognition !== undefined ? { recognition: u.recognition } : {}),
        ...(u.notes !== undefined ? { notes: u.notes ?? null } : {}),
        ...(u.active !== undefined ? { active: u.active } : {}),
        updatedAt: new Date(),
      })
      .where(eq(recurringItems.id, g.id))
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[PATCH /api/admin/finance/recurring/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.delete(recurringItems).where(eq(recurringItems.id, g.id))
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[DELETE /api/admin/finance/recurring/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
