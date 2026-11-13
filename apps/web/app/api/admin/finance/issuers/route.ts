import { db, issuers } from "@cuik/db"
import { issuerSchema } from "@cuik/shared/validators"
import { loadCompany, loadIssuers } from "@/lib/admin/company-data"
import { isUniqueViolation } from "@/lib/admin/company-writes"
import { overlappingIssuer, validityLabel } from "@/lib/admin/issuers"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Add an issuer (a razón social that invoices for Cuik in some months). */
export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = issuerSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const v = parsed.data
    const clash = overlappingIssuer(await loadIssuers(), v)
    if (clash)
      return errorResponse(
        `Se cruza con ${clash.razonSocial} (${validityLabel(clash)}): dos emisores no pueden facturar el mismo mes`,
        409,
      )
    try {
      await db.insert(issuers).values({ ...v, updatedBy: session.user.id })
    } catch (err) {
      if (isUniqueViolation(err)) return errorResponse("Ya existe un emisor con ese RUC", 409)
      throw err
    }
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[POST /api/admin/finance/issuers]", err)
    return errorResponse("Internal server error", 500)
  }
}
