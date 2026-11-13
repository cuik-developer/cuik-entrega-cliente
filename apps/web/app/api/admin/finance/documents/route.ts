import { documentSchema, financeMonthSchema } from "@cuik/shared/validators"
import { currentMonthLima } from "@/lib/admin/company-data"
import {
  createDocument,
  DocumentError,
  isDocumentNumberConflict,
  loadDocumentsPage,
} from "@/lib/admin/documents-data"
import { badRequest, requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

/** Finanzas › Ventas / Compras of one tax period: ?direction=sale|purchase&month=YYYY-MM. */
export async function GET(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const url = new URL(request.url)
    const direction = url.searchParams.get("direction")
    if (direction !== "sale" && direction !== "purchase")
      return errorResponse("direction inválido", 400)
    const monthParam = url.searchParams.get("month")
    const month =
      monthParam && financeMonthSchema.safeParse(monthParam).success
        ? monthParam
        : currentMonthLima()
    return successResponse(await loadDocumentsPage(direction, month))
  } catch (err) {
    console.error("[GET /api/admin/finance/documents]", err)
    return errorResponse("Internal server error", 500)
  }
}

/** Register a document (sale or purchase). Returns its id. */
export async function POST(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const parsed = documentSchema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    try {
      const id = await createDocument(parsed.data, g.session.user.id)
      return successResponse({ id }, 201)
    } catch (err) {
      if (err instanceof DocumentError) return errorResponse(err.message, err.status)
      if (isDocumentNumberConflict(err))
        return errorResponse("Ya existe un comprobante con ese número", 409)
      throw err
    }
  } catch (err) {
    console.error("[POST /api/admin/finance/documents]", err)
    return errorResponse("Internal server error", 500)
  }
}
