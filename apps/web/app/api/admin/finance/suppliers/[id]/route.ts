import { db, eq, suppliers } from "@cuik/db"
import { supplierSchema } from "@cuik/shared/validators"
import { isUniqueViolation } from "@/lib/admin/company-writes"
import { loadSuppliers } from "@/lib/admin/documents-data"
import { badRequest, requireSuperAdmin, UUID_RE } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

type Ctx = { params: Promise<{ id: string }> }

/** Replace a supplier (whole object). Documents keep the name they were registered with. */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const { id } = await ctx.params
    if (!UUID_RE.test(id)) return errorResponse("Not found", 404)
    const parsed = supplierSchema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    const v = parsed.data
    try {
      const updated = await db
        .update(suppliers)
        .set({
          docType: v.docType,
          docNumber: v.docNumber ?? null,
          name: v.name,
          country: v.docType === "foreign" ? v.country : "PE",
          domiciled: v.docType === "foreign" ? v.domiciled : true,
          defaultCategory: v.defaultCategory ?? null,
          defaultIgvTreatment: v.defaultIgvTreatment ?? null,
          notes: v.notes ?? null,
          updatedBy: g.session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, id))
        .returning({ id: suppliers.id })
      if (updated.length === 0) return errorResponse("Not found", 404)
    } catch (err) {
      if (isUniqueViolation(err))
        return errorResponse("Ya existe un proveedor con ese documento", 409)
      throw err
    }
    return successResponse({ id, suppliers: await loadSuppliers() })
  } catch (err) {
    console.error("[PUT /api/admin/finance/suppliers/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

/** Delete a supplier with no documents (those block it). */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const { id } = await ctx.params
    if (!UUID_RE.test(id)) return errorResponse("Not found", 404)
    try {
      await db.delete(suppliers).where(eq(suppliers.id, id))
    } catch (err) {
      const code = (err as { cause?: { code?: string } } | null)?.cause?.code
      // ON DELETE RESTRICT raises restrict_violation (23001); a plain FK violation is 23503.
      if (code === "23001" || code === "23503")
        return errorResponse("Tiene comprobantes registrados: no se puede eliminar", 409)
      throw err
    }
    return successResponse({ id, suppliers: await loadSuppliers() })
  } catch (err) {
    console.error("[DELETE /api/admin/finance/suppliers/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
