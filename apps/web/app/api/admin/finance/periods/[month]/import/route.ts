import { randomUUID } from "node:crypto"
import { parseCloseWorkbook } from "@/lib/admin/close-excel"
import { type MonthCtx, periodErrorResponse, periodGuard } from "@/lib/admin/period-route"
import { saveAccountantImport } from "@/lib/admin/periods-data"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { deleteAsset, uploadAsset } from "@/lib/storage"

export const runtime = "nodejs"
const MAX_BYTES = 5 * 1024 * 1024
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/**
 * Import the accountant's close (the template, filled). multipart/form-data
 * with `file` (.xlsx). Rows with errors are reported and skipped; the file is
 * kept in the private bucket next to the period.
 */
export async function POST(request: Request, ctx: MonthCtx) {
  try {
    const g = await periodGuard(request, ctx)
    if ("error" in g) return g.error
    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
      return errorResponse("Archivo demasiado grande (máximo 5 MB)", 413)
    }
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }
    const file = form.get("file")
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    if (file.size > MAX_BYTES) return errorResponse("Archivo demasiado grande (máximo 5 MB)", 400)
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return errorResponse("Sube el Excel (.xlsx) de la plantilla", 400)
    }

    const buffer = await file.arrayBuffer()
    let parsed: Awaited<ReturnType<typeof parseCloseWorkbook>>
    try {
      parsed = await parseCloseWorkbook(buffer)
    } catch {
      return errorResponse("No se pudo leer el Excel: usa la plantilla descargada de Cierres", 400)
    }
    if (Object.keys(parsed.summary).length === 0 && parsed.lines.length === 0) {
      return errorResponse(parsed.errors[0] ?? "El archivo no tiene datos del cierre", 400)
    }
    const key = `finance/closes/${g.month}/${randomUUID()}.xlsx`
    await uploadAsset(key, Buffer.from(buffer), XLSX)
    try {
      await saveAccountantImport(
        g.month,
        { summary: parsed.summary as Record<string, number | string>, lines: parsed.lines },
        { key, name: file.name.slice(0, 200) },
        g.session.user.id,
      )
    } catch (err) {
      await deleteAsset(key).catch(() => undefined)
      const res = periodErrorResponse(err)
      if (res) return res
      throw err
    }
    return successResponse(
      { month: g.month, lines: parsed.lines.length, errors: parsed.errors },
      201,
    )
  } catch (err) {
    console.error("[POST /api/admin/finance/periods/[month]/import]", err)
    return errorResponse("Internal server error", 500)
  }
}
