import { and, db, eq, tenantInvoices } from "@cuik/db"

import { loadBilling } from "@/lib/admin/billing-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { deleteAsset, uploadAsset } from "@/lib/storage"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
}

/**
 * Attach the issued invoice (PDF) or the payment voucher to an invoice record.
 * multipart/form-data: `kind` = invoice | receipt, `file`. Super-admin only.
 * Stored under tenants/{id}/billing/ and served ONLY through the sibling GET
 * route (the generic /api/assets route is public and must not be used here).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id, invoiceId } = await params
    if (!UUID.test(id) || !UUID.test(invoiceId)) return errorResponse("Not found", 404)

    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
      return errorResponse("Archivo demasiado grande (máximo 10 MB)", 413)
    }

    const [row] = await db
      .select()
      .from(tenantInvoices)
      .where(and(eq(tenantInvoices.id, invoiceId), eq(tenantInvoices.tenantId, id)))
      .limit(1)
    if (!row) return errorResponse("Not found", 404)

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const kind = formData.get("kind")
    const file = formData.get("file")
    if (kind !== "invoice" && kind !== "receipt") return errorResponse("kind inválido", 400)
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    if (file.size > MAX_BYTES) return errorResponse("Archivo demasiado grande (máximo 10 MB)", 400)
    const ext = ALLOWED[file.type]
    if (!ext) return errorResponse("Solo PDF, JPG o PNG", 400)

    const key = `tenants/${id}/billing/${invoiceId}-${kind}-${Date.now()}.${ext}`
    await uploadAsset(key, Buffer.from(await file.arrayBuffer()), file.type)

    const previousKey = kind === "invoice" ? row.invoiceFileKey : row.receiptFileKey
    await db
      .update(tenantInvoices)
      .set(
        kind === "invoice"
          ? { invoiceFileKey: key, invoiceFileName: file.name.slice(0, 200) }
          : { receiptFileKey: key, receiptFileName: file.name.slice(0, 200) },
      )
      .where(eq(tenantInvoices.id, invoiceId))
    if (previousKey) await deleteAsset(previousKey).catch(() => undefined)

    return successResponse(await loadBilling(id), 201)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/billing/invoices/[invoiceId]/files]", error)
    return errorResponse("Internal server error", 500)
  }
}
