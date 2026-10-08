import { db, eq, tenantBilling, tenants } from "@cuik/db"
import { tenantBillingSchema } from "@cuik/shared/validators"

import { loadBilling } from "@/lib/admin/billing-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(request: Request, params: Promise<{ id: string }>) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return { error: authError }
  const roleError = requireRole(session, "super_admin")
  if (roleError) return { error: roleError }
  const { id } = await params
  if (!UUID.test(id)) return { error: errorResponse("Invalid tenant ID", 400) }
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1)
  if (!tenant) return { error: errorResponse("Tenant not found", 404) }
  return { session, tenant }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error
    return successResponse(await loadBilling(g.tenant.id))
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/billing]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** Upsert the billing config (whole object; empty strings clear a field). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error
    const parsed = tenantBillingSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const b = parsed.data
    const values = {
      ruc: b.ruc ?? null,
      razonSocial: b.razonSocial ?? null,
      direccionFiscal: b.direccionFiscal ?? null,
      billingEmail: b.billingEmail ?? null,
      contactoPagos: b.contactoPagos ?? null,
      monthlyAmount:
        b.monthlyAmount === null || b.monthlyAmount === undefined ? null : String(b.monthlyAmount),
      currency: b.currency,
      serviceStartOn: b.serviceStartOn ?? null,
      billingDay: b.billingDay ?? null,
      notes: b.notes ?? null,
      updatedBy: g.session.user.id,
      updatedAt: new Date(),
    }
    await db
      .insert(tenantBilling)
      .values({ tenantId: g.tenant.id, ...values })
      .onConflictDoUpdate({ target: tenantBilling.tenantId, set: values })
    return successResponse(await loadBilling(g.tenant.id))
  } catch (error) {
    console.error("[PUT /api/admin/tenants/[id]/billing]", error)
    return errorResponse("Internal server error", 500)
  }
}
