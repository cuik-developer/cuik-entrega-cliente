import { db, suppliers } from "@cuik/db"
import { supplierSchema } from "@cuik/shared/validators"
import { isUniqueViolation } from "@/lib/admin/company-writes"
import { loadSuppliers } from "@/lib/admin/documents-data"
import { badRequest, requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    return successResponse(await loadSuppliers())
  } catch (err) {
    console.error("[GET /api/admin/finance/suppliers]", err)
    return errorResponse("Internal server error", 500)
  }
}

/** Add a supplier. Returns the updated list and the new id. */
export async function POST(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const parsed = supplierSchema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    const v = parsed.data
    try {
      const [row] = await db
        .insert(suppliers)
        .values({
          docType: v.docType,
          docNumber: v.docNumber ?? null,
          name: v.name,
          country: v.docType === "foreign" ? v.country : "PE",
          domiciled: v.docType === "foreign" ? v.domiciled : true,
          defaultCategory: v.defaultCategory ?? null,
          defaultIgvTreatment: v.defaultIgvTreatment ?? null,
          notes: v.notes ?? null,
          updatedBy: g.session.user.id,
        })
        .returning({ id: suppliers.id })
      return successResponse({ id: row?.id ?? null, suppliers: await loadSuppliers() }, 201)
    } catch (err) {
      if (isUniqueViolation(err))
        return errorResponse("Ya existe un proveedor con ese documento", 409)
      throw err
    }
  } catch (err) {
    console.error("[POST /api/admin/finance/suppliers]", err)
    return errorResponse("Internal server error", 500)
  }
}
