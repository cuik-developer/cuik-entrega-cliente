import ExcelJS from "exceljs"

import {
  cellText,
  cellValue,
  isPlaceholderName,
  normalizeAmount,
  normalizeDay,
  normalizeDni,
  normalizePhone,
} from "./columns"
import type { ColumnMapping, SaleOrder } from "./types"

export const MAX_FILE_BYTES = 40 * 1024 * 1024
export const MAX_ROWS = 400_000

/** A sales file read into memory: the header row and every data row as plain values. */
export type SalesSheet = {
  headers: string[]
  rows: unknown[][]
}

/** CSV with "," or ";" (whichever appears more in the first line), quotes and CRLF. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a character-by-character CSV state machine reads clearer in one function
export function parseCsv(text: string): unknown[][] {
  const firstLine = text.slice(0, text.indexOf("\n") >= 0 ? text.indexOf("\n") : text.length)
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: unknown[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const src = text.startsWith("﻿") ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      cell = ""
      if (row.some((c) => c.trim() !== "")) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== "")) rows.push(row)
  return rows
}

/**
 * Reads .xlsx (first worksheet) or .csv into headers + rows. Returns a
 * user-facing error for what the operator can fix.
 */
export async function readSalesFile(
  buffer: Buffer,
  fileName: string,
): Promise<SalesSheet | { error: string }> {
  const lower = fileName.toLowerCase()
  let raw: unknown[][]
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    raw = parseCsv(buffer.toString("utf8"))
  } else if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook()
    try {
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
    } catch {
      return { error: "No se pudo leer el archivo. ¿Es un .xlsx válido?" }
    }
    const ws = wb.worksheets[0]
    if (!ws || ws.rowCount === 0) return { error: "El archivo está vacío" }
    raw = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[]
      // ExcelJS rows are 1-based: values[0] is always empty.
      raw.push(values.slice(1).map(cellValue))
    })
  } else {
    return { error: "Solo se aceptan archivos .xlsx o .csv" }
  }
  if (raw.length < 2) return { error: "El archivo no tiene filas de datos" }
  if (raw.length - 1 > MAX_ROWS) {
    return { error: `El archivo supera el máximo de ${MAX_ROWS.toLocaleString("es-PE")} filas` }
  }
  const width = Math.max(...raw.slice(0, 50).map((r) => r.length))
  const headers = Array.from({ length: width }, (_, i) => cellText(raw[0][i]) ?? `Columna ${i + 1}`)
  return { headers, rows: raw.slice(1) }
}

export type BuildResult = {
  orders: SaleOrder[]
  rowsTotal: number
  /** Rows skipped for lacking a readable date (the file's own problem, reported). */
  rowsWithoutDate: number
  /** Purchases dropped for an impossible amount (a barcode typed into the amount, say). */
  ordersWithBadAmount: number
}

/**
 * Above this a single purchase is a typing error, not a sale (S/ 25 345 614 871
 * seen in a real Odoo export, refunded right after). Dropping it keeps the
 * corte honest and the row inside numeric(12,2).
 */
export const MAX_ORDER_AMOUNT = 100_000

/**
 * Rows -> purchases. With an order reference, lines of the same order are
 * added up (Odoo exports one line per product); without one, each row is a
 * purchase. Rows without a readable date are dropped and counted.
 */
export function buildOrders(rows: unknown[][], mapping: ColumnMapping): BuildResult {
  const col = (row: unknown[], f: keyof ColumnMapping) =>
    mapping[f] === null ? null : (row[mapping[f] as number] ?? null)
  const orders = new Map<string, SaleOrder>()
  const loose: SaleOrder[] = []
  let rowsWithoutDate = 0
  for (const row of rows) {
    const day = normalizeDay(col(row, "date"))
    if (!day) {
      rowsWithoutDate++
      continue
    }
    const idType = cellText(col(row, "idType"))
    const name = cellText(col(row, "name"))
    const rawDni = normalizeDni(col(row, "dni"))
    // A document typed as something else (RUC, CE, passport) is not a DNI even if it has 8 digits.
    const typeOk = !idType || /dni/i.test(idType)
    const dni = typeOk && !isPlaceholderName(name) ? rawDni : null
    const amount = normalizeAmount(col(row, "amount"))
    const ref = cellText(col(row, "orderRef"))
    const base: SaleOrder = {
      orderRef: ref,
      dni,
      name: name && !isPlaceholderName(name) ? name : null,
      phone: normalizePhone(col(row, "phone")),
      store: cellText(col(row, "store")),
      cashier: cellText(col(row, "cashier")),
      day,
      amount,
    }
    if (!ref) {
      loose.push(base)
      continue
    }
    const existing = orders.get(ref)
    if (!existing) orders.set(ref, base)
    else {
      existing.amount += amount
      existing.dni ??= base.dni
      existing.name ??= base.name
      existing.phone ??= base.phone
      existing.store ??= base.store
      existing.cashier ??= base.cashier
    }
  }
  const all: SaleOrder[] = []
  let ordersWithBadAmount = 0
  for (const o of [...orders.values(), ...loose]) {
    if (!Number.isFinite(o.amount) || Math.abs(o.amount) > MAX_ORDER_AMOUNT) {
      ordersWithBadAmount++
      continue
    }
    all.push({ ...o, amount: Math.round(o.amount * 100) / 100 })
  }
  return { orders: all, rowsTotal: rows.length, rowsWithoutDate, ordersWithBadAmount }
}
