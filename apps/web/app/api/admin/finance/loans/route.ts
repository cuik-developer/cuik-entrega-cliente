import { db, loans } from "@cuik/db"
import { loanSchema } from "@cuik/shared/validators"
import { loadFinance } from "@/lib/admin/finance-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/** Register a loan paid in equal monthly installments. */
export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const parsed = loanSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const l = parsed.data
    await db.insert(loans).values({
      name: l.name,
      principal: String(l.principal),
      currency: l.currency,
      installment: String(l.installment),
      installments: l.installments,
      firstMonth: l.firstMonth,
      notes: l.notes ?? null,
      createdBy: session.user.id,
    })
    return successResponse(await loadFinance(), 201)
  } catch (err) {
    console.error("[POST /api/admin/finance/loans]", err)
    return errorResponse("Internal server error", 500)
  }
}
