import { financeMonthSchema } from "@cuik/shared/validators"
import { errorResponse } from "@/lib/api-utils"
import { DocumentError } from "./document-error"
import { requireSuperAdmin } from "./route-guard"

export type MonthCtx = { params: Promise<{ month: string }> }

/** Owner session and a valid "YYYY-MM" from the URL, or the response to return. */
export async function periodGuard(request: Request, ctx: MonthCtx) {
  const g = await requireSuperAdmin(request)
  if (!g.ok) return { error: g.error }
  const { month } = await ctx.params
  if (!financeMonthSchema.safeParse(month).success) {
    return { error: errorResponse("Mes inválido", 400) }
  }
  return { session: g.session, month }
}

/** Known errors to their HTTP answer; null for unexpected ones. */
export function periodErrorResponse(err: unknown) {
  if (err instanceof DocumentError) return errorResponse(err.message, err.status)
  return null
}
