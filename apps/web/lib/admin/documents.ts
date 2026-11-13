/**
 * Fiscal documents (pure): SUNAT document types, "F001-123" numbers, IGV
 * treatment of purchases, sign of credit notes and conversion to soles.
 * Everything that touches the DB lives in documents-data.ts.
 */

import { splitIgv } from "./issuers"

export type DocType = "01" | "03" | "07" | "08" | "02" | "12" | "14" | "91" | "00"
export type IgvTreatment = "credito" | "sin_credito" | "representacion" | "no_domiciliado"
export type Direction = "sale" | "purchase"

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  "01": "Factura",
  "03": "Boleta",
  "07": "Nota de crédito",
  "08": "Nota de débito",
  "02": "Recibo por honorarios",
  "12": "Ticket",
  "14": "Recibo de servicios",
  "91": "Comprobante del exterior",
  "00": "Otro",
}

/** Types offered per direction (sales: what Cuik issues). */
export const DOC_TYPES_BY_DIRECTION: Record<Direction, DocType[]> = {
  sale: ["01", "03", "07", "08"],
  purchase: ["01", "03", "12", "02", "14", "91", "07", "08", "00"],
}

export const IGV_TREATMENT_LABEL: Record<IgvTreatment, string> = {
  credito: "Con crédito fiscal",
  sin_credito: "Sin crédito fiscal",
  representacion: "Gasto de representación",
  no_domiciliado: "No domiciliado",
}

export const RENTA_LABEL: Record<"si" | "no" | "limitado", string> = {
  si: "Deducible",
  no: "No deducible",
  limitado: "Deducible con tope",
}

/** A credit note subtracts from the period; every other type adds. */
export function docSign(docType: DocType): 1 | -1 {
  return docType === "07" ? -1 : 1
}

/**
 * "F001-000123", "f001 - 123" or "E001-45" → { serie: "F001", numero: "123" }.
 * The number loses leading zeros so "F001-000123" and "F001-123" are the
 * same document. Null when it does not look like serie-número.
 */
export function parseSerieNumero(raw: string): { serie: string; numero: string } | null {
  const m = raw
    .trim()
    .toUpperCase()
    .match(/^([A-Z0-9]{1,4})\s*-\s*(\d{1,10})$/)
  if (!m?.[1] || !m[2]) return null
  return { serie: m[1], numero: String(Number(m[2])) }
}

/** "F001-123" for display. */
export function formatSerieNumero(serie: string, numero: string): string {
  return `${serie}-${numero}`
}

/** Normalizes a number typed in a form (drops leading zeros); null if not digits. */
export function normalizeNumero(raw: string): string | null {
  const t = raw.trim()
  return /^\d{1,10}$/.test(t) ? String(Number(t)) : null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Amount in soles: USD uses the document's own rate. */
export function toPen(amount: number, currency: "PEN" | "USD", fxRate: number | null): number {
  return round2(currency === "USD" ? amount * (fxRate ?? 0) : amount)
}

/** Whether base + no gravada + IGV adds up to the total (2 cents of rounding allowed). */
export function amountsAddUp(d: {
  baseGravada: number
  baseNoGravada: number
  igv: number
  total: number
}): boolean {
  return Math.abs(round2(d.baseGravada + d.baseNoGravada + d.igv) - round2(d.total)) <= 0.02
}

/**
 * Fiscal amounts of a merchant invoice registered in Facturación: the whole
 * amount is taxable; the tenant says whether it already includes IGV.
 */
export function saleAmountsFromInvoice(amount: number, includesIgv: boolean, igvRate: number) {
  const s = splitIgv(amount, includesIgv, igvRate)
  return { baseGravada: s.base, baseNoGravada: 0, igv: s.igv, total: s.total }
}

/** Sums of a list of documents in soles, credit notes subtracting. Void ones are left out. */
export function documentTotals(
  docs: {
    docType: DocType
    status: "registered" | "void"
    currency: "PEN" | "USD"
    fxRate: number | null
    baseGravada: number
    baseNoGravada: number
    igv: number
    total: number
  }[],
) {
  const acc = { count: 0, baseGravada: 0, baseNoGravada: 0, igv: 0, total: 0 }
  for (const d of docs) {
    if (d.status === "void") continue
    const k = docSign(d.docType)
    acc.count += 1
    acc.baseGravada += k * toPen(d.baseGravada, d.currency, d.fxRate)
    acc.baseNoGravada += k * toPen(d.baseNoGravada, d.currency, d.fxRate)
    acc.igv += k * toPen(d.igv, d.currency, d.fxRate)
    acc.total += k * toPen(d.total, d.currency, d.fxRate)
  }
  return {
    count: acc.count,
    baseGravada: round2(acc.baseGravada),
    baseNoGravada: round2(acc.baseNoGravada),
    igv: round2(acc.igv),
    total: round2(acc.total),
  }
}
