import { and, db, eq, sales } from "@cuik/db"

import { readSalesFile } from "@/lib/loyalty/impact/parse"
import { linkSaleToVisit } from "./links-review"

/**
 * Carga masiva de decisiones: the "Registros sin venta" sheet (the CSV this
 * screen exports, or the Excel sent to the merchant) comes back with a
 * decision per row. Rows marked "Enlazar" link the stamp (visita_id) to the
 * sale (venta_id, or the POS order reference when there is no id). Any other
 * decision is left alone.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ImportRow = {
  line: number
  visitId: string | null
  saleId: string | null
  orderRef: string | null
  decision: string
}

export type ImportResult = {
  rows: number
  toLink: number
  linked: number
  /** Rows marked "Enlazar" that could not be applied, with the reason. */
  failed: { line: number; reason: string }[]
  /** Rows with another decision (kept as they are). */
  skipped: number
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()

const HEADER = {
  visitId: ["visita_id", "visit_id", "visita id"],
  saleId: ["venta_id", "sale_id", "venta id"],
  orderRef: ["venta candidata", "venta mas cercana", "order_ref", "referencia", "orden"],
  decision: ["decision", "decisión", "accion", "resultado"],
}

function findColumn(headers: string[], names: string[]): number {
  const h = headers.map(norm)
  for (const n of names) {
    const i = h.indexOf(norm(n))
    if (i >= 0) return i
  }
  return -1
}

/** True for "Enlazar", "Sí", "Si", "Yes", "Link", "X". */
export function isLinkDecision(value: unknown): boolean {
  const v = norm(value)
  return ["enlazar", "si", "yes", "link", "x", "ok"].includes(v)
}

export async function parseLinksFile(
  buffer: Buffer,
  fileName: string,
): Promise<{ rows: ImportRow[] } | { error: string }> {
  const sheet = await readSalesFile(buffer, fileName)
  if ("error" in sheet) return sheet
  // The merchant's Excel has a group row above the headers: the header row
  // is wherever "visita_id" sits.
  const all: unknown[][] = [sheet.headers, ...sheet.rows]
  const headerIdx = all.findIndex((r) => r.some((c) => norm(c) === "visita_id"))
  if (headerIdx < 0) return { error: "El archivo no tiene la columna visita_id" }
  const headers = all[headerIdx].map((c) => String(c ?? ""))
  const col = {
    visitId: findColumn(headers, HEADER.visitId),
    saleId: findColumn(headers, HEADER.saleId),
    orderRef: findColumn(headers, HEADER.orderRef),
    decision: findColumn(headers, HEADER.decision),
  }
  if (col.decision < 0) return { error: "El archivo no tiene la columna Decisión" }
  if (col.saleId < 0 && col.orderRef < 0) {
    return { error: "El archivo necesita venta_id o la referencia de la venta" }
  }
  const rows: ImportRow[] = []
  all.slice(headerIdx + 1).forEach((r, i) => {
    const visitId = String(r[col.visitId] ?? "").trim()
    const decision = String(r[col.decision] ?? "").trim()
    if (!visitId && !decision) return
    const saleId = col.saleId >= 0 ? String(r[col.saleId] ?? "").trim() : ""
    const orderRef = col.orderRef >= 0 ? String(r[col.orderRef] ?? "").trim() : ""
    rows.push({
      line: headerIdx + i + 2,
      visitId: UUID.test(visitId) ? visitId : null,
      saleId: UUID.test(saleId) ? saleId : null,
      orderRef: orderRef || null,
      decision,
    })
  })
  return { rows }
}

export async function applyLinks(tenantId: string, rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { rows: rows.length, toLink: 0, linked: 0, failed: [], skipped: 0 }
  for (const r of rows) {
    if (!isLinkDecision(r.decision)) {
      result.skipped++
      continue
    }
    result.toLink++
    if (!r.visitId) {
      result.failed.push({ line: r.line, reason: "visita_id inválido" })
      continue
    }
    let saleId = r.saleId
    if (!saleId && r.orderRef) {
      const [s] = await db
        .select({ id: sales.id })
        .from(sales)
        .where(and(eq(sales.tenantId, tenantId), eq(sales.orderRef, r.orderRef)))
        .limit(1)
      saleId = s?.id ?? null
      if (!saleId) {
        result.failed.push({ line: r.line, reason: `Venta ${r.orderRef} no encontrada` })
        continue
      }
    }
    if (!saleId) {
      result.failed.push({ line: r.line, reason: "Sin venta en la fila" })
      continue
    }
    const linked = await linkSaleToVisit(tenantId, saleId, r.visitId)
    if (linked.ok) result.linked++
    else result.failed.push({ line: r.line, reason: linked.error })
  }
  return result
}
