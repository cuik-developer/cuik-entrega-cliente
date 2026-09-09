import { clients, db, eq } from "@cuik/db"
import ExcelJS from "exceljs"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"
import {
  type ColumnLayout,
  detectColumns,
  type ImportRow,
  matchRecipients,
  type TenantClientRow,
} from "@/lib/campaigns/match-recipients"

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_DATA_ROWS = 20000

/** ExcelJS cell values come in many shapes; reduce them to a trimmed string or null. */
function cellToString(value: ExcelJS.CellValue): string | null {
  if (value == null) return null
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null
  if (value instanceof Date) return null
  if (typeof value === "object") {
    if ("richText" in value)
      return (
        value.richText
          .map((r) => r.text)
          .join("")
          .trim() || null
      )
    if ("text" in value && typeof value.text === "string") return value.text.trim() || null
    if ("result" in value && value.result != null) return String(value.result).trim() || null
  }
  return null
}

type ParsedSheet = { rows: ImportRow[]; layout: ColumnLayout }

/**
 * Reads the first worksheet into ImportRow[]. Returns a user-facing error
 * string for anything the operator can fix (empty file, too many rows, …).
 */
async function parseRecipientsWorkbook(file: File): Promise<ParsedSheet | { error: string }> {
  const wb = new ExcelJS.Workbook()
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    // exceljs 4.4 ships its own pre-generic `Buffer` typing; runtime value is identical.
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  } catch {
    return { error: "No se pudo leer el archivo. ¿Es un .xlsx válido?" }
  }

  const ws = wb.worksheets[0]
  if (!ws || ws.rowCount === 0) return { error: "El archivo está vacío" }

  // Header detection on row 1. If nothing recognisable, row 1 is data (A=DNI, B=phone).
  const headerCells: unknown[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    headerCells.push(cellToString(cell.value))
  })
  const layout = detectColumns(headerCells)
  const firstDataRow = layout.hasHeader ? 2 : 1

  const rows: ImportRow[] = []
  for (let r = firstDataRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const dni = layout.dniCol === null ? null : cellToString(row.getCell(layout.dniCol + 1).value)
    const phone =
      layout.phoneCol === null ? null : cellToString(row.getCell(layout.phoneCol + 1).value)
    // Fully blank rows (separators, trailing) are dropped silently and never counted.
    // A row that has other data but no DNI/phone is kept and reported as "empty".
    if (dni === null && phone === null && !row.hasValues) continue
    rows.push({ row: r, dni, phone })
    if (rows.length > MAX_DATA_ROWS) {
      return { error: `El archivo supera el máximo de ${MAX_DATA_ROWS} filas` }
    }
  }
  if (rows.length === 0) return { error: "No se encontraron filas con datos" }

  return { rows, layout }
}

/**
 * POST /api/[tenant]/campaigns/import-recipients
 * multipart/form-data with `file` (.xlsx). Matches rows against the tenant's
 * clients by DNI or phone and returns matched client ids + rejected rows.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return errorResponse("Invalid form data", 400)
    }

    const file = formData.get("file")
    if (!(file instanceof File)) return errorResponse("Falta el archivo", 400)
    // Extension + a successful ExcelJS parse are the real gate. The MIME header is
    // client-controlled and inconsistent for .xlsx (octet-stream from curl/some browsers).
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return errorResponse("Solo se aceptan archivos .xlsx", 400)
    }
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse(
        `Archivo demasiado grande (máximo ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
        400,
      )
    }

    const parsed = await parseRecipientsWorkbook(file)
    if ("error" in parsed) return errorResponse(parsed.error, 400)

    const tenantClients: TenantClientRow[] = await db
      .select({
        id: clients.id,
        name: clients.name,
        lastName: clients.lastName,
        dni: clients.dni,
        phone: clients.phone,
        status: clients.status,
      })
      .from(clients)
      .where(eq(clients.tenantId, tenant.id))

    const result = matchRecipients(parsed.rows, tenantClients)
    const { layout } = parsed

    return successResponse({
      ...result,
      layout: {
        hasHeader: layout.hasHeader,
        dniColumn: layout.dniCol === null ? null : layout.dniCol + 1,
        phoneColumn: layout.phoneCol === null ? null : layout.phoneCol + 1,
      },
    })
  } catch (error) {
    console.error("[POST /api/[tenant]/campaigns/import-recipients]", error)
    return errorResponse("Internal server error", 500)
  }
}
