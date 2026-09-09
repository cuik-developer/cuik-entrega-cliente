import ExcelJS from "exceljs"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
} from "@/lib/api-utils"

const HEADER_BLUE = "FF0E70DB"

/**
 * GET /api/[tenant]/campaigns/import-recipients/template
 * Empty .xlsx the operator fills in for a bulk recipient import.
 * Sheet 1 ("Destinatarios") is what the importer reads; sheet 2 is help text.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
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

    const wb = new ExcelJS.Workbook()
    wb.creator = "Cuik"

    // Data sheet — must be first: the importer only reads worksheets[0].
    const ws = wb.addWorksheet("Destinatarios")
    ws.columns = [
      { header: "DNI", key: "dni", width: 16, style: { numFmt: "@" } },
      { header: "Teléfono", key: "phone", width: 20, style: { numFmt: "@" } },
    ]
    const header = ws.getRow(1)
    header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BLUE } }
    header.alignment = { vertical: "middle", horizontal: "center" }
    header.height = 24
    ws.views = [{ state: "frozen", ySplit: 1 }]
    // No example rows on purpose: any 8-digit DNI or 9-digit phone could belong to a
    // real client, and an operator who forgets to delete the examples would push to
    // them. Format examples live in the "Instrucciones" sheet instead. The column-level
    // numFmt "@" above already keeps leading zeros for whatever the operator types.

    const info = wb.addWorksheet("Instrucciones")
    info.columns = [{ width: 100 }]
    const lines: Array<[string, boolean?]> = [
      ["CÓMO USAR ESTA PLANTILLA", true],
      [""],
      ['1. Completá la hoja "Destinatarios" a partir de la fila 2, un cliente por fila.'],
      [
        "2. Cada fila es un cliente. Podés poner solo DNI, solo Teléfono, o los dos (si hay DNI se usa primero).",
      ],
      ['3. No cambies los encabezados "DNI" y "Teléfono" de la fila 1.'],
      ["4. Máximo 20.000 filas y 5 MB. Guardá como .xlsx (no .xls ni .csv)."],
      [""],
      ["FORMATOS ACEPTADOS", true],
      [""],
      ["DNI: da igual con o sin puntos/espacios → 12.345.678 y 12345678 son el mismo."],
      [
        "DNI: la columna ya está en formato Texto para que no se pierdan los ceros iniciales (ej. 07654321).",
      ],
      [
        "Teléfono: da igual el formato → +51 987 654 321, 51987654321 y 987654321 son el mismo número.",
      ],
      [""],
      ["QUÉ PASA AL SUBIRLO", true],
      [""],
      [
        "Cuik cruza cada fila con tus clientes registrados y te muestra cuántos encontró y cuántos rechazó.",
      ],
      [
        "Motivos de rechazo: no existe un cliente con ese DNI/teléfono · cliente bloqueado · repetido en el archivo · fila sin DNI ni teléfono.",
      ],
      ["Podés descargar los rechazados, corregirlos y volver a subir el archivo."],
      ["Las filas totalmente vacías se ignoran."],
    ]
    for (const [text, bold] of lines) {
      const row = info.addRow([text])
      if (bold) row.font = { bold: true, color: { argb: HEADER_BLUE }, size: 12 }
      row.alignment = { wrapText: true, vertical: "top" }
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="plantilla-destinatarios-cuik.xlsx"',
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/campaigns/import-recipients/template]", error)
    return errorResponse("Internal server error", 500)
  }
}
