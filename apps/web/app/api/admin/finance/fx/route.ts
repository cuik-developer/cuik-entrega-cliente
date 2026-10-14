import { db, fxRates } from "@cuik/db"
import { fxRateSchema } from "@cuik/shared/validators"
import { loadFinance } from "@/lib/admin/finance-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Set (or replace) the USD→PEN rate of one month. */
export async function PUT(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = fxRateSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const values = {
      usdPen: String(parsed.data.usdPen),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }
    await db
      .insert(fxRates)
      .values({ month: parsed.data.month, ...values })
      .onConflictDoUpdate({ target: fxRates.month, set: values })
    return successResponse(await loadFinance())
  } catch (err) {
    console.error("[PUT /api/admin/finance/fx]", err)
    return errorResponse("Internal server error", 500)
  }
}
