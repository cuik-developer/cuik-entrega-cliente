import { randomUUID } from "node:crypto"
import { db, documents, eq } from "@cuik/db"
import {
  DOCUMENT_FILE_RULES,
  type DocumentFileKind,
  documentFileExt,
} from "@/lib/admin/document-files"
import { requireSuperAdmin, UUID_RE } from "@/lib/admin/route-guard"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { deleteAsset, uploadAsset } from "@/lib/storage"

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Attach a file to a document. multipart/form-data: `kind` = pdf | xml | cdr,
 * `file`. Stored under finance/documents/ (never matched by the public
 * /api/assets route) and served only by the sibling super-admin GET route.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await requireSuperAdmin(request)
    if (!g.ok) return g.error
    const { id } = await params
    if (!UUID_RE.test(id)) return errorResponse("Not found", 404)

    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
      return errorResponse("Archivo demasiado grande (máximo 10 MB)", 413)
    }
    const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
    if (!row) return errorResponse("Not found", 404)

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const kind = formData.get("kind")
    const file = formData.get("file")
    if (kind !== "pdf" && kind !== "xml" && kind !== "cdr")
      return errorResponse("kind inválido", 400)
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    if (file.size > MAX_BYTES) return errorResponse("Archivo demasiado grande (máximo 10 MB)", 400)
    const ext = documentFileExt(kind as DocumentFileKind, file.name, file.type)
    if (!ext) return errorResponse(DOCUMENT_FILE_RULES[kind as DocumentFileKind].error, 400)

    const key = `finance/documents/${row.taxPeriod}/${id}-${kind}-${randomUUID()}.${ext}`
    await uploadAsset(
      key,
      Buffer.from(await file.arrayBuffer()),
      file.type || "application/octet-stream",
    )

    const name = file.name.slice(0, 200)
    const previous = kind === "pdf" ? row.pdfKey : kind === "xml" ? row.xmlKey : row.cdrKey
    await db
      .update(documents)
      .set(
        kind === "pdf"
          ? { pdfKey: key, pdfName: name }
          : kind === "xml"
            ? { xmlKey: key, xmlName: name }
            : { cdrKey: key, cdrName: name },
      )
      .where(eq(documents.id, id))
    if (previous) await deleteAsset(previous).catch(() => undefined)
    return successResponse({ id }, 201)
  } catch (err) {
    console.error("[POST /api/admin/finance/documents/[id]/files]", err)
    return errorResponse("Internal server error", 500)
  }
}
