import type { AccountantLine } from "@cuik/db"
import ExcelJS from "exceljs"
import { normHeader, parseAmount, SUMMARY_CONCEPTS, SUMMARY_TEXT, type SummaryCode } from "./close"
import { monthShort } from "./issuers"

/**
 * The accountant's month-end close as a workbook, both ways:
 *  - buildCloseTemplate: "Instrucciones", "Resumen" (one row per PDT concept,
 *    the panel's figure as reference and an empty "Contador" column) and
 *    "Registro" (one row per document as the panel has it, to correct or add).
 *  - parseCloseWorkbook: reads the same sheets back; headers are matched
 *    without accents or case, so a copy re-saved by the accountant still reads.
 */

const REG_COLUMNS = [
  { header: "LIBRO", key: "book", width: 8 },
  { header: "TIPO", key: "docType", width: 7 },
  { header: "SERIE", key: "serie", width: 9 },
  { header: "NUMERO", key: "numero", width: 11 },
  { header: "FECHA", key: "date", width: 12 },
  { header: "DOC_CONTRAPARTE", key: "counterpartyDoc", width: 16 },
  { header: "RAZON_SOCIAL", key: "counterpartyName", width: 34 },
  { header: "MONEDA", key: "currency", width: 8 },
  { header: "TC", key: "fxRate", width: 8 },
  { header: "BASE", key: "base", width: 12 },
  { header: "IGV", key: "igv", width: 11 },
  { header: "NO_GRAVADO", key: "noGravado", width: 12 },
  { header: "TOTAL", key: "total", width: 12 },
  { header: "OBSERVACION", key: "note", width: 30 },
] as const

export async function buildCloseTemplate(input: {
  month: string
  issuer: { razonSocial: string; ruc: string }
  panel: Record<SummaryCode, number>
  lines: AccountantLine[]
}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const money = "#,##0.00;[Red]-#,##0.00"
  const head = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1)
    row.font = { bold: true, color: { argb: "FFFFFFFF" } }
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } }
    row.height = 22
  }

  const info = wb.addWorksheet("Instrucciones")
  info.columns = [{ width: 110 }]
  for (const line of [
    `Cierre de ${monthShort(input.month)} · ${input.issuer.razonSocial} · RUC ${input.issuer.ruc}`,
    "",
    "1. Hoja Resumen: escribe en la columna «Contador» lo declarado en el PDT 621 (en soles).",
    "   La columna «Panel» es lo que calculó Cuik; sirve de referencia y no se importa.",
    "   Completa también el número de orden y la fecha de presentación.",
    "2. Hoja Registro: es el registro de ventas (V) y compras (C) que tiene el panel.",
    "   Corrige lo que no coincida con tus libros, agrega los comprobantes que falten y borra los que no van.",
    "   Montos siempre en positivo (una nota de crédito, tipo 07, resta por su tipo). TIPO con el código SUNAT (01, 03, 07…).",
    "3. Devuelve este archivo: se importa en Finanzas › Cierres y el panel muestra las diferencias.",
  ]) {
    info.addRow([line])
  }
  info.getRow(1).font = { bold: true, size: 13 }

  const res = wb.addWorksheet("Resumen")
  res.columns = [
    { header: "CODIGO", key: "code", width: 28 },
    { header: "CONCEPTO", key: "label", width: 44 },
    { header: "PANEL", key: "panel", width: 14, style: { numFmt: money } },
    { header: "CONTADOR", key: "declared", width: 14, style: { numFmt: money } },
  ]
  head(res)
  for (const c of SUMMARY_CONCEPTS) {
    res.addRow({ code: c.code, label: c.label, panel: input.panel[c.code] ?? 0, declared: null })
  }
  for (const t of SUMMARY_TEXT) {
    res.addRow({ code: t.code, label: t.label, panel: null, declared: null })
  }

  const reg = wb.addWorksheet("Registro")
  reg.columns = REG_COLUMNS.map((c) => ({ ...c }))
  head(reg)
  for (const l of input.lines) reg.addRow(l)
  for (const k of ["base", "igv", "noGravado", "total"]) reg.getColumn(k).numFmt = money

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export type ParsedClose = {
  summary: Partial<Record<string, number | string>>
  lines: AccountantLine[]
  errors: string[]
}

/** Text of a cell (dates as YYYY-MM-DD, formulas by their result). */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue)
    if ("text" in v) return String(v.text)
    if ("richText" in v) return v.richText.map((r) => r.text).join("")
  }
  return String(v).trim()
}
function cellNumber(v: ExcelJS.CellValue): number | null {
  if (v !== null && typeof v === "object" && !(v instanceof Date) && "result" in v) {
    return parseAmount(v.result)
  }
  return parseAmount(v instanceof Date ? null : v)
}

/** One concept of the Resumen sheet into `summary`; returns an error message or null. */
function readSummaryCell(
  summary: ParsedClose["summary"],
  code: string,
  cell: ExcelJS.CellValue,
  numeric: Set<string>,
  text: Set<string>,
): string | null {
  if (numeric.has(code)) {
    if (cellText(cell) === "") return null
    const value = cellNumber(cell)
    if (value === null) return `${code} no es un monto`
    summary[code] = value
  } else if (text.has(code)) {
    // A date typed in the money-formatted column comes back as an Excel serial.
    const serial = code === "FECHA_PRESENTACION" && typeof cell === "number" && cell > 20000
    const value = serial
      ? new Date(Date.UTC(1899, 11, 30) + (cell as number) * 86_400_000).toISOString().slice(0, 10)
      : cellText(cell)
    if (value) summary[code] = value
  }
  return null
}

/** One row of the Registro sheet: a line, an error, or null for an empty row. */
function readRegistroRow(
  get: (k: string) => ExcelJS.CellValue,
): { line: AccountantLine } | { error: string } | null {
  const book = cellText(get("book")).toUpperCase()
  const serie = cellText(get("serie")).toUpperCase()
  const numero = cellText(get("numero"))
  if (!book && !serie && !numero) return null
  if (book !== "V" && book !== "C") return { error: "LIBRO debe ser V o C" }
  const total = cellNumber(get("total"))
  if (!serie || !numero || total === null) return { error: "faltan serie, número o total" }
  const docType = cellText(get("docType"))
  if (!/^\d{1,2}$/.test(docType)) return { error: "TIPO debe ser el código SUNAT (01, 03, 07…)" }
  const currency = cellText(get("currency")).toUpperCase() === "USD" ? "USD" : "PEN"
  const fxRate = cellNumber(get("fxRate"))
  if (currency === "USD" && !(fxRate && fxRate > 0)) {
    return { error: "falta el TC del comprobante en dólares" }
  }
  const bad = ["base", "igv", "noGravado"].find(
    (k) => cellText(get(k)) !== "" && cellNumber(get(k)) === null,
  )
  if (bad) return { error: `${bad.toUpperCase()} no es un monto` }
  const text = (k: string) => cellText(get(k)) || null
  const amount = (k: string) => Math.abs(cellNumber(get(k)) ?? 0)
  return {
    line: {
      book,
      docType: docType.padStart(2, "0"),
      serie,
      numero,
      date: text("date"),
      counterpartyDoc: text("counterpartyDoc"),
      counterpartyName: text("counterpartyName"),
      currency,
      fxRate,
      base: amount("base"),
      igv: amount("igv"),
      noGravado: amount("noGravado"),
      total: Math.abs(total),
      note: text("note"),
    },
  }
}

/** Reads the accountant's workbook. Errors are per row, in Spanish; valid rows still come through. */
export async function parseCloseWorkbook(buffer: ArrayBuffer): Promise<ParsedClose> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const errors: string[] = []
  const sheet = (name: string) =>
    wb.worksheets.find((w) => normHeader(w.name) === normHeader(name)) ?? null

  const summary: ParsedClose["summary"] = {}
  const res = sheet("Resumen")
  if (!res) errors.push("Falta la hoja «Resumen»")
  else {
    const numeric = new Set<string>(SUMMARY_CONCEPTS.map((c) => c.code))
    const text = new Set<string>(SUMMARY_TEXT.map((c) => c.code))
    const header = (res.getRow(1).values as ExcelJS.CellValue[]).map(normHeader)
    const codeCol = header.indexOf("codigo")
    const valueCol = header.indexOf("contador")
    if (codeCol < 0 || valueCol < 0)
      errors.push("La hoja «Resumen» debe tener las columnas CODIGO y CONTADOR")
    else {
      res.eachRow((row, n) => {
        if (n === 1) return
        const code = cellText(row.getCell(codeCol).value).toUpperCase()
        const error = readSummaryCell(summary, code, row.getCell(valueCol).value, numeric, text)
        if (error) errors.push(`Resumen, fila ${n}: ${error}`)
      })
    }
  }

  const lines: AccountantLine[] = []
  const reg = sheet("Registro")
  if (!reg) errors.push("Falta la hoja «Registro»")
  else {
    const header = (reg.getRow(1).values as ExcelJS.CellValue[]).map(normHeader)
    const col = (name: string) => header.indexOf(normHeader(name))
    const idx = Object.fromEntries(REG_COLUMNS.map((c) => [c.key, col(c.header)]))
    const missing = ["book", "docType", "serie", "numero", "total"].filter(
      (k) => (idx[k] ?? -1) < 0,
    )
    if (missing.length > 0) {
      errors.push("La hoja «Registro» debe tener LIBRO, TIPO, SERIE, NUMERO y TOTAL")
    } else {
      reg.eachRow((row, n) => {
        if (n === 1) return
        const get = (k: string) => {
          const i = idx[k] ?? -1
          return i < 0 ? null : row.getCell(i).value
        }
        const res = readRegistroRow(get)
        if (res === null) return
        if ("error" in res) errors.push(`Registro, fila ${n}: ${res.error}`)
        else lines.push(res.line)
      })
    }
  }
  return { summary, lines, errors }
}
