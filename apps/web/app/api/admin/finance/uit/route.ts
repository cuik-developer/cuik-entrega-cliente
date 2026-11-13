import { db, uitValues } from "@cuik/db"
import { uitValueSchema } from "@cuik/shared/validators"
import { loadCompany } from "@/lib/admin/company-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Set (or replace) the UIT of one year. */
export async function PUT(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = uitValueSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const values = {
      value: String(parsed.data.value),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }
    await db
      .insert(uitValues)
      .values({ year: parsed.data.year, ...values })
      .onConflictDoUpdate({ target: uitValues.year, set: values })
    return successResponse(await loadCompany())
  } catch (err) {
    console.error("[PUT /api/admin/finance/uit]", err)
    return errorResponse("Internal server error", 500)
  }
}
