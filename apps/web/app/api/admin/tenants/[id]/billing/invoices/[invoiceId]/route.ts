import { and, db, eq, tenantInvoices } from "@cuik/db"
import { updateInvoiceSchema } from "@cuik/shared/validators"
import { loadBilling } from "@/lib/admin/billing-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string; invoiceId: string }> }

async function guard(request: Request, ctx: Ctx) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return { error: authError }
  const roleError = requireRole(session, "super_admin")
  if (roleError) return { error: roleError }
  const { id, invoiceId } = await ctx.params
  if (!UUID.test(id) || !UUID.test(invoiceId)) return { error: errorResponse("Not found", 404) }
  const [row] = await db
    .select()
    .from(tenantInvoices)
    .where(and(eq(tenantInvoices.id, invoiceId), eq(tenantInvoices.tenantId, id)))
    .limit(1)
  if (!row) return { error: errorResponse("Not found", 404) }
  return { id, row }
}

/** Edit an invoice (status change: pending → paid / void, number, amount, dates). */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const parsed = updateInvoiceSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const u = parsed.data
    const nextStatus = u.status ?? g.row.status
    try {
      await db
        .update(tenantInvoices)
        .set({
          ...(u.period !== undefined ? { period: u.period } : {}),
          ...(u.issuedOn !== undefined ? { issuedOn: u.issuedOn } : {}),
          ...(u.number !== undefined ? { number: u.number } : {}),
          ...(u.amount !== undefined ? { amount: String(u.amount) } : {}),
          ...(u.currency !== undefined ? { currency: u.currency } : {}),
          status: nextStatus,
          paidOn:
            nextStatus === "paid"
              ? (u.paidOn ?? g.row.paidOn ?? g.row.issuedOn)
              : u.paidOn !== undefined
                ? u.paidOn
                : g.row.paidOn,
          ...(u.note !== undefined ? { note: u.note } : {}),
        })
        .where(eq(tenantInvoices.id, g.row.id))
    } catch (err) {
      if (err instanceof Error && /tenant_invoices_tenant_period_uidx/.test(err.message)) {
        return errorResponse("Ya hay otra factura activa para ese periodo", 409)
      }
      throw err
    }
    return successResponse(await loadBilling(g.id))
  } catch (error) {
    console.error("[PATCH /api/admin/tenants/[id]/billing/invoices/[invoiceId]]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.delete(tenantInvoices).where(eq(tenantInvoices.id, g.row.id))
    return successResponse(await loadBilling(g.id))
  } catch (error) {
    console.error("[DELETE /api/admin/tenants/[id]/billing/invoices/[invoiceId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
