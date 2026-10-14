import { db, financeEntries } from "@cuik/db"
import { financeEntrySchema } from "@cuik/shared/validators"
import { loadFinance } from "@/lib/admin/finance-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Create a one-off movement: variable cost, other income, partner contribution or return. */
export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = financeEntrySchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const e = parsed.data
    await db.insert(financeEntries).values({
      type: e.type,
      category: e.category,
      name: e.name,
      amount: String(e.amount),
      currency: e.currency,
      month: e.month,
      months: e.months,
      recognition: e.recognition,
      tenantId: e.tenantId ?? null,
      notes: e.notes ?? null,
      createdBy: session.user.id,
    })
    return successResponse(await loadFinance(), 201)
  } catch (err) {
    console.error("[POST /api/admin/finance/entries]", err)
    return errorResponse("Internal server error", 500)
  }
}
