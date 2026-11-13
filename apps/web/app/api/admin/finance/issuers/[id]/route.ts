import { db, eq, issuers } from "@cuik/db"
import { issuerSchema } from "@cuik/shared/validators"
import { loadCompany, loadIssuers } from "@/lib/admin/company-data"
import { isUniqueViolation } from "@/lib/admin/company-writes"
import { overlappingIssuer, validityLabel } from "@/lib/admin/issuers"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

/** Replace an issuer's data and validity (whole object). */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await ctx.params
    if (!UUID.test(id)) return errorResponse("Not found", 404)
    const parsed = issuerSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const v = parsed.data
    const all = await loadIssuers()
    if (!all.some((i) => i.id === id)) return errorResponse("Not found", 404)
    const clash = overlappingIssuer(all, v, id)
    if (clash)
      return errorResponse(
        `Se cruza con ${clash.razonSocial} (${validityLabel(clash)}): dos emisores no pueden facturar el mismo mes`,
        409,
      )
    try {
      await db
        .update(issuers)
        .set({ ...v, updatedBy: session.user.id, updatedAt: new Date() })
        .where(eq(issuers.id, id))
    } catch (err) {
      if (isUniqueViolation(err)) return errorResponse("Ya existe un emisor con ese RUC", 409)
      throw err
    }
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[PUT /api/admin/finance/issuers/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
