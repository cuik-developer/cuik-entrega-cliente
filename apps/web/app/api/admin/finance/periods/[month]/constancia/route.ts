import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { type MonthCtx, periodErrorResponse, periodGuard } from "@/lib/admin/period-route"
import { getConstancia, setConstancia } from "@/lib/admin/periods-data"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { deleteAsset, getAsset, uploadAsset } from "@/lib/storage"

export const runtime = "nodejs"
const MAX_BYTES = 10 * 1024 * 1024

/** Attach the filing receipt of the month's PDT 621 (PDF). */
export async function POST(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
      return errorResponse("Archivo demasiado grande (máximo 10 MB)", 413)
    }
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const file = form.get("file")
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    if (file.size > MAX_BYTES) return errorResponse("Archivo demasiado grande (máximo 10 MB)", 400)
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return errorResponse("Sube la constancia en PDF", 400)
    }
    const key = `finance/closes/${g.month}/constancia-${randomUUID()}.pdf`
    await uploadAsset(key, Buffer.from(await file.arrayBuffer()), "application/pdf")
    let previous: string | null
    try {
      previous = await setConstancia(g.month, key, file.name.slice(0, 200), g.session.user.id)
    } catch (err) {
      await deleteAsset(key).catch(() => undefined)
      const res = periodErrorResponse(err)
      if (res) return res
      throw err
    }
    if (previous) await deleteAsset(previous).catch(() => undefined)
    return successResponse({ month: g.month }, 201)
  } catch (err) {
    console.error("[POST /api/admin/finance/periods/[month]/constancia]", err)
    return errorResponse("Internal server error", 500)
  }
}

/** Private download of the receipt. */
export async function GET(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    const c = await getConstancia(g.month)
    if (!c) return errorResponse("Not found", 404)
    const { stream, size } = await getAsset(c.key)
    const safeName = c.name.replace(/[^\w.\- ]+/g, "_")
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    console.error("[GET /api/admin/finance/periods/[month]/constancia]", err)
    return errorResponse("Internal server error", 500)
  }
}
