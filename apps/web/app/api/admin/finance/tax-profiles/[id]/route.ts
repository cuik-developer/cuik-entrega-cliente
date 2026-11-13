import { db, eq, issuers, taxProfiles } from "@cuik/db"
import { taxProfileSchema } from "@cuik/shared/validators"
import { loadCompany } from "@/lib/admin/company-data"
import { isUniqueViolation, profileValues } from "@/lib/admin/company-writes"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

async function guard(request: Request, ctx: Ctx) {
  const { session, error } = await requireAuth(request)
  if (error) return { error }
  const roleError = requireRole(session, "super_admin")
  if (roleError) return { error: roleError }
  const { id } = await ctx.params
  if (!UUID.test(id)) return { error: errorResponse("Not found", 404) }
  const [row] = await db
    .select({ id: taxProfiles.id, validated: taxProfiles.validatedByAccountant })
    .from(taxProfiles)
    .where(eq(taxProfiles.id, id))
    .limit(1)
  if (!row) return { error: errorResponse("Not found", 404) }
  return { session, row }
}

/** Replace a tax profile (whole object). */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    const parsed = taxProfileSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const [issuer] = await db
      .select({ id: issuers.id })
      .from(issuers)
      .where(eq(issuers.id, parsed.data.issuerId))
      .limit(1)
    if (!issuer) return errorResponse("Emisor no encontrado", 404)
    try {
      await db
        .update(taxProfiles)
        .set(profileValues(parsed.data, g.session.user.id, g.row.validated))
        .where(eq(taxProfiles.id, g.row.id))
    } catch (err) {
      if (isUniqueViolation(err))
        return errorResponse("Ese emisor ya tiene un régimen que empieza en ese mes", 409)
      throw err
    }
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[PUT /api/admin/finance/tax-profiles/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const g = await guard(request, ctx)
    if ("error" in g) return g.error
    await db.delete(taxProfiles).where(eq(taxProfiles.id, g.row.id))
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[DELETE /api/admin/finance/tax-profiles/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
