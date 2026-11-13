import { db, eq, tenantBilling, tenants } from "@cuik/db"
import { tenantFiscalSchema } from "@cuik/shared/validators"

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
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1)
  if (!tenant) return { error: errorResponse("Tenant not found", 404) }
  return { session, tenant }
}

async function loadFiscal(tenantId: string) {
  const [row] = await db
    .select({
      ruc: tenantBilling.ruc,
      razonSocial: tenantBilling.razonSocial,
      direccionFiscal: tenantBilling.direccionFiscal,
      billingEmail: tenantBilling.billingEmail,
      isRetentionAgent: tenantBilling.isRetentionAgent,
      updatedAt: tenantBilling.updatedAt,
    })
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, tenantId))
    .limit(1)
  return row
    ? { ...row, updatedAt: row.updatedAt.toISOString() }
    : {
        ruc: null,
        razonSocial: null,
        direccionFiscal: null,
        billingEmail: null,
        isRetentionAgent: false,
        updatedAt: null,
      }
}

/** Billing identity of the merchant (Comercios › tenant › Datos del negocio). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error
    return successResponse(await loadFiscal(g.tenant.id))
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/fiscal]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * Upsert only the fiscal columns of `tenant_billing` (RUC, razón social,
 * dirección fiscal, invoice e-mail, withholding agent). Fee and calendar stay
 * with the Facturación tab.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard(request, params)
    if ("error" in g) return g.error
    const parsed = tenantFiscalSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const f = parsed.data
    const values = {
      ruc: f.ruc ?? null,
      razonSocial: f.razonSocial ?? null,
      direccionFiscal: f.direccionFiscal ?? null,
      billingEmail: f.billingEmail ?? null,
      isRetentionAgent: f.isRetentionAgent,
      updatedBy: g.session.user.id,
      updatedAt: new Date(),
    }
    await db
      .insert(tenantBilling)
      .values({ tenantId: g.tenant.id, ...values })
      .onConflictDoUpdate({ target: tenantBilling.tenantId, set: values })
    return successResponse(await loadFiscal(g.tenant.id))
  } catch (error) {
    console.error("[PUT /api/admin/tenants/[id]/fiscal]", error)
    return errorResponse("Internal server error", 500)
  }
}
