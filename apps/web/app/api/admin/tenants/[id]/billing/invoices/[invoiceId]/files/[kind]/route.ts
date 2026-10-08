import { Readable } from "node:stream"
import { and, db, eq, tenantInvoices } from "@cuik/db"

import { errorResponse, requireAuth, requireRole } from "@/lib/api-utils"
import { getAsset } from "@/lib/storage"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Private download of an invoice PDF or payment voucher. Super-admin only;
 * streams from the storage bucket with no public caching.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string; kind: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id, invoiceId, kind } = await params
    if (!UUID.test(id) || !UUID.test(invoiceId)) return errorResponse("Not found", 404)
    if (kind !== "invoice" && kind !== "receipt") return errorResponse("Not found", 404)

    const [row] = await db
      .select({
        invoiceFileKey: tenantInvoices.invoiceFileKey,
        invoiceFileName: tenantInvoices.invoiceFileName,
        receiptFileKey: tenantInvoices.receiptFileKey,
        receiptFileName: tenantInvoices.receiptFileName,
      })
      .from(tenantInvoices)
      .where(and(eq(tenantInvoices.id, invoiceId), eq(tenantInvoices.tenantId, id)))
      .limit(1)
    const key = kind === "invoice" ? row?.invoiceFileKey : row?.receiptFileKey
    const name = (kind === "invoice" ? row?.invoiceFileName : row?.receiptFileName) ?? kind
    if (!key) return errorResponse("Not found", 404)

    const { stream, contentType, size } = await getAsset(key)
    const ext = key.split(".").pop() ?? ""
    const type =
      contentType !== "application/octet-stream"
        ? contentType
        : ext === "pdf"
          ? "application/pdf"
          : ext === "jpg"
            ? "image/jpeg"
            : ext === "png"
              ? "image/png"
              : contentType
    const safeName = name.replace(/[^\w.\- ]+/g, "_")
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(size),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/billing/invoices/[invoiceId]/files/[kind]]", error)
    return errorResponse("Internal server error", 500)
  }
}
