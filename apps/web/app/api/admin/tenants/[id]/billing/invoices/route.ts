import { db, eq, tenantInvoices, tenants } from "@cuik/db"
import { createInvoiceSchema } from "@cuik/shared/validators"
import { loadBilling } from "@/lib/admin/billing-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Record an invoice issued outside Cuik for one billing period. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const parsed = createInvoiceSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const i = parsed.data

    try {
      await db.insert(tenantInvoices).values({
        tenantId: id,
        period: i.period,
        issuedOn: i.issuedOn,
        number: i.number ?? null,
        amount: String(i.amount),
        currency: i.currency,
        status: i.status,
        paidOn: i.status === "paid" ? (i.paidOn ?? i.issuedOn) : (i.paidOn ?? null),
        note: i.note ?? null,
        createdBy: session.user.id,
      })
    } catch (err) {
      // Partial unique index: one live invoice per period.
      if (err instanceof Error && /tenant_invoices_tenant_period_uidx/.test(err.message)) {
        return errorResponse(`Ya hay una factura registrada para el periodo ${i.period}`, 409)
      }
      throw err
    }
    return successResponse(await loadBilling(id), 201)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/billing/invoices]", error)
    return errorResponse("Internal server error", 500)
  }
}
