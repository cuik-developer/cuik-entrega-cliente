import { z } from "zod"
import {
  createSaleForInvoice,
  DocumentError,
  isDocumentNumberConflict,
} from "@/lib/admin/documents-data"
import { badRequest, requireSuperAdmin } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"

const bodySchema = z.object({ invoiceId: z.string().uuid() })

/** Create the missing sale of a Facturación invoice (registered before Ventas existed). */
export async function POST(request: Request) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) return badRequest(parsed.error.flatten())
    try {
      const id = await createSaleForInvoice(parsed.data.invoiceId, g.session.user.id)
      return successResponse({ id }, 201)
    } catch (err) {
      if (err instanceof DocumentError) return errorResponse(err.message, err.status)
      if (isDocumentNumberConflict(err)) {
        return errorResponse("Ya existe un comprobante con ese número", 409)
      }
      throw err
    }
  } catch (err) {
    console.error("[POST /api/admin/finance/documents/from-invoice]", err)
    return errorResponse("Internal server error", 500)
  }
}
