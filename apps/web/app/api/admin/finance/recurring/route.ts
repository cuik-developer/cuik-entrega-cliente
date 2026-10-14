import { db, recurringItems } from "@cuik/db"
import { recurringItemSchema } from "@cuik/shared/validators"
import { loadFinance } from "@/lib/admin/finance-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Create a recurring cost or income. */
export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = recurringItemSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const r = parsed.data
    if (r.toMonth && r.toMonth < r.fromMonth)
      return errorResponse("El mes final es anterior al inicial", 400)
    await db.insert(recurringItems).values({
      type: r.type,
      category: r.category,
      name: r.name,
      amount: String(r.amount),
      currency: r.currency,
      everyMonths: r.everyMonths,
      fromMonth: r.fromMonth,
      toMonth: r.toMonth ?? null,
      recognition: r.recognition,
      notes: r.notes ?? null,
      active: r.active,
      createdBy: session.user.id,
    })
    return successResponse(await loadFinance(), 201)
  } catch (err) {
    console.error("[POST /api/admin/finance/recurring]", err)
    return errorResponse("Internal server error", 500)
  }
}
