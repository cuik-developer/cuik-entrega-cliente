import { db, eq, issuers, taxProfiles } from "@cuik/db"
import { taxProfileSchema } from "@cuik/shared/validators"
import { loadCompany } from "@/lib/admin/company-data"
import { isUniqueViolation, profileValues } from "@/lib/admin/company-writes"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Add a regime/rates profile for an issuer from a month on. */
export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = taxProfileSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const [issuer] = await db
      .select({ id: issuers.id })
      .from(issuers)
      .where(eq(issuers.id, parsed.data.issuerId))
      .limit(1)
    if (!issuer) return errorResponse("Emisor no encontrado", 404)
    try {
      await db.insert(taxProfiles).values(profileValues(parsed.data, session.user.id, false))
    } catch (err) {
      if (isUniqueViolation(err))
        return errorResponse("Ese emisor ya tiene un régimen que empieza en ese mes", 409)
      throw err
    }
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[POST /api/admin/finance/tax-profiles]", err)
    return errorResponse("Internal server error", 500)
  }
}
