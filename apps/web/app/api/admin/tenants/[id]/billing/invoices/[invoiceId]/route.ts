import { and, db, eq, tenantInvoices } from "@cuik/db"
import { type UpdateInvoiceInput, updateInvoiceSchema } from "@cuik/shared/validators"
import {
  findCoverageClash,
  isPeriodConflict,
  loadBilling,
  lockTenantInvoices,
} from "@/lib/admin/billing-data"
import {
  DocumentError,
  deleteDocumentRow,
  isDocumentNumberConflict,
  syncSaleFromInvoice,
} from "@/lib/admin/documents-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { deleteAsset } from "@/lib/storage"

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
  return { id, row, session }
}

/** Columns to write for a PATCH: only what was sent, plus status and the paid date it implies. */
function invoicePatch(
  u: UpdateInvoiceInput,
  row: typeof tenantInvoices.$inferSelect,
  nextStatus: "pending" | "paid" | "void",
) {
  return {
    ...(u.period !== undefined ? { period: u.period } : {}),
    ...(u.months !== undefined ? { months: u.months } : {}),
    ...(u.recognition !== undefined ? { recognition: u.recognition } : {}),
    ...(u.issuedOn !== undefined ? { issuedOn: u.issuedOn } : {}),
    ...(u.number !== undefined ? { number: u.number } : {}),
    ...(u.amount !== undefined ? { amount: String(u.amount) } : {}),
    ...(u.currency !== undefined ? { currency: u.currency } : {}),
    status: nextStatus,
    paidOn:
      nextStatus === "paid"
        ? (u.paidOn ?? row.paidOn ?? row.issuedOn)
        : u.paidOn !== undefined
          ? u.paidOn
          : row.paidOn,
    ...(u.note !== undefined ? { note: u.note } : {}),
  }
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
      const clash = await db.transaction(async (tx) => {
        await lockTenantInvoices(tx, g.id)
        // A live invoice (edited or reactivated) must not overlap another one.
        if (nextStatus !== "void") {
          const msg = await findCoverageClash(
            tx,
            g.id,
            u.period ?? g.row.period,
            u.months ?? g.row.months,
            g.row.id,
          )
          if (msg) return msg
        }
        const [updated] = await tx
          .update(tenantInvoices)
          .set(invoicePatch(u, g.row, nextStatus))
          .where(eq(tenantInvoices.id, g.row.id))
          .returning()
        // Keep the sale in Finanzas › Ventas in step (number, amount, date, void).
        if (updated) {
          await syncSaleFromInvoice(tx, updated, g.session.user.id, {
            // Editing the number or date must leave a valid sale; marking paid never blocks.
            strict: u.number !== undefined || u.issuedOn !== undefined,
            amountChanged:
              u.amount !== undefined || u.currency !== undefined || u.issuedOn !== undefined,
          })
        }
        return null
      })
      if (clash) return errorResponse(clash, 409)
    } catch (err) {
      if (isPeriodConflict(err)) {
        return errorResponse("Ya hay otra factura activa para ese periodo", 409)
      }
      if (err instanceof DocumentError) return errorResponse(err.message, err.status)
      if (isDocumentNumberConflict(err)) {
        return errorResponse("Ya existe un comprobante con ese número", 409)
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
    // Its sale in Finanzas › Ventas goes with it, so the number can be registered again.
    const docKeys = await db.transaction(async (tx) => {
      await lockTenantInvoices(tx, g.id)
      await tx.delete(tenantInvoices).where(eq(tenantInvoices.id, g.row.id))
      return g.row.documentId ? deleteDocumentRow(tx, g.row.documentId) : []
    })
    // The attachments go with the record (best effort: a missing object is not an error).
    for (const key of [g.row.invoiceFileKey, g.row.receiptFileKey, ...docKeys]) {
      if (key) await deleteAsset(key).catch(() => undefined)
    }
    return successResponse(await loadBilling(g.id))
  } catch (error) {
    console.error("[DELETE /api/admin/tenants/[id]/billing/invoices/[invoiceId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
