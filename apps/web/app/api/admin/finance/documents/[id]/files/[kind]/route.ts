import { Readable } from "node:stream"
import { db, documents, eq } from "@cuik/db"
import { documentFileServe } from "@/lib/admin/document-files"
import { requireSuperAdmin, UUID_RE } from "@/lib/admin/route-guard"
import { errorResponse } from "@/lib/api-utils"
import { getAsset } from "@/lib/storage"

export const runtime = "nodejs"

/** Private download of a document's PDF, XML or CDR. Super-admin only, never cached. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const { id, kind } = await params
    if (!UUID_RE.test(id)) return errorResponse("Not found", 404)
    if (kind !== "pdf" && kind !== "xml" && kind !== "cdr") return errorResponse("Not found", 404)
    const [row] = await db
      .select({
        pdfKey: documents.pdfKey,
        pdfName: documents.pdfName,
        xmlKey: documents.xmlKey,
        xmlName: documents.xmlName,
        cdrKey: documents.cdrKey,
        cdrName: documents.cdrName,
      })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1)
    const key = kind === "pdf" ? row?.pdfKey : kind === "xml" ? row?.xmlKey : row?.cdrKey
    const name =
      (kind === "pdf" ? row?.pdfName : kind === "xml" ? row?.xmlName : row?.cdrName) || kind
    if (!key) return errorResponse("Not found", 404)

    const { stream, size } = await getAsset(key)
    const { type, inline } = documentFileServe(key)
    const safeName = name.replace(/[^\w.\- ]+/g, "_")
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    console.error("[GET /api/admin/finance/documents/[id]/files/[kind]]", err)
    return errorResponse("Internal server error", 500)
  }
}
