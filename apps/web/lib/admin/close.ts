/**
 * Month-end close with the accountant (pure): the concepts of the summary
 * (PDT 621), what the panel computed for each, and the reconciliation of the
 * accountant's figures and registry against the panel's.
 */

import type { MonthTax } from "./tax"

export type SummaryCode =
  | "VENTAS_BASE"
  | "IGV_DEBITO"
  | "IGV_CREDITO"
  | "SALDO_FAVOR_ANTERIOR"
  | "RETENCIONES_PERCEPCIONES"
  | "IGV_A_PAGAR"
  | "SALDO_FAVOR_SIGUIENTE"
  | "PAGO_A_CUENTA_RENTA"

/** Numeric concepts, in the order of the template and the reconciliation. */
export const SUMMARY_CONCEPTS: {
  code: SummaryCode
  label: string
  panel: (t: MonthTax) => number
}[] = [
  { code: "VENTAS_BASE", label: "Ventas: valor de venta (base)", panel: (t) => t.salesBase },
  { code: "IGV_DEBITO", label: "IGV de ventas (débito fiscal)", panel: (t) => t.salesIgv },
  {
    code: "IGV_CREDITO",
    label: "IGV de compras (crédito fiscal)",
    panel: (t) => t.purchaseIgvCredit,
  },
  {
    code: "SALDO_FAVOR_ANTERIOR",
    label: "Saldo a favor del mes anterior",
    panel: (t) => t.igvCreditCarried,
  },
  { code: "RETENCIONES_PERCEPCIONES", label: "Retenciones y percepciones de IGV", panel: () => 0 },
  { code: "IGV_A_PAGAR", label: "IGV a pagar (1011)", panel: (t) => t.igvToPay },
  {
    code: "SALDO_FAVOR_SIGUIENTE",
    label: "Saldo a favor para el mes siguiente",
    panel: (t) => t.igvCreditNext,
  },
  {
    code: "PAGO_A_CUENTA_RENTA",
    label: "Pago a cuenta de renta (3121)",
    panel: (t) => t.incomeAdvance,
  },
]

/** Text fields of the summary (stored, not compared). */
export const SUMMARY_TEXT = [
  { code: "NUMERO_ORDEN", label: "Número de orden de la declaración" },
  { code: "FECHA_PRESENTACION", label: "Fecha de presentación (AAAA-MM-DD)" },
] as const

/** The PDT 621 is in whole soles: up to S/ 1 apart is rounding, not a difference. */
export const TOLERANCE = 1

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function panelSnapshot(t: MonthTax): Record<SummaryCode, number> {
  const out = {} as Record<SummaryCode, number>
  for (const c of SUMMARY_CONCEPTS) out[c.code] = round2(c.panel(t))
  return out
}

export type SummaryRow = {
  code: SummaryCode
  label: string
  panel: number
  declared: number | null
  diff: number | null
  status: "ok" | "diff" | "missing"
}

export function reconcileSummary(
  panel: Record<SummaryCode, number>,
  declared: Partial<Record<string, number | string>> | null,
): SummaryRow[] {
  return SUMMARY_CONCEPTS.map((c) => {
    const raw = declared?.[c.code]
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null
    const p = panel[c.code] ?? 0
    if (value === null)
      return {
        code: c.code,
        label: c.label,
        panel: p,
        declared: null,
        diff: null,
        status: "missing",
      }
    const diff = round2(value - p)
    return {
      code: c.code,
      label: c.label,
      panel: p,
      declared: value,
      diff,
      status: Math.abs(diff) <= TOLERANCE ? "ok" : "diff",
    }
  })
}

/** One document as both sides see it, for the line-by-line reconciliation. */
export type LineLike = {
  book: "V" | "C"
  docType: string
  serie: string
  numero: string
  counterpartyDoc: string | null
  counterpartyName: string | null
  total: number
  igv: number
}

/** "V|01|F001|7|…": the identity of a document (purchases also by supplier: numbers repeat across suppliers). */
export function lineKey(l: LineLike): string {
  const numero = /^\d+$/.test(l.numero.trim())
    ? String(Number(l.numero))
    : l.numero.trim().toUpperCase()
  const party = l.book === "C" ? (l.counterpartyDoc ?? "").trim() : ""
  return [
    l.book,
    l.docType.trim().padStart(2, "0"),
    l.serie.trim().toUpperCase(),
    numero,
    party,
  ].join("|")
}

export type LineMatch = {
  key: string
  status: "ok" | "amount" | "only_panel" | "only_accountant" | "duplicate"
  panel: LineLike | null
  accountant: LineLike | null
}

/** Pairs both registries: matched, different amounts (more than 1 cent), or only on one side. */
export function reconcileLines(panel: LineLike[], accountant: LineLike[]): LineMatch[] {
  const mine = new Map(panel.map((l) => [lineKey(l), l]))
  const theirs = new Map<string, LineLike>()
  const out: LineMatch[] = []
  // A document the accountant listed twice is an error worth showing, not a silent merge.
  for (const l of accountant) {
    const key = lineKey(l)
    if (theirs.has(key)) out.push({ key, status: "duplicate", panel: null, accountant: l })
    else theirs.set(key, l)
  }
  for (const [key, p] of mine) {
    const a = theirs.get(key) ?? null
    if (!a) {
      out.push({ key, status: "only_panel", panel: p, accountant: null })
      continue
    }
    const same = Math.abs(p.total - a.total) <= 0.01 && Math.abs(p.igv - a.igv) <= 0.01
    out.push({ key, status: same ? "ok" : "amount", panel: p, accountant: a })
  }
  for (const [key, a] of theirs) {
    if (!mine.has(key)) out.push({ key, status: "only_accountant", panel: null, accountant: a })
  }
  const order = { duplicate: 0, amount: 1, only_accountant: 2, only_panel: 3, ok: 4 }
  return out.sort((x, y) => order[x.status] - order[y.status] || x.key.localeCompare(y.key))
}

/** Normalizes a header cell: lower case, no accents, single spaces. */
export function normHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

/** "1,234.50", "S/ 1 234,50", 1234.5 → 1234.5; null when empty or not a number. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (v === null || v === undefined) return null
  let s = String(v).replace(/s\/|us\$|\s/gi, "")
  if (s === "" || s === "-") return null
  // "1.234,50" → "1234.50"; "1,234.50" → "1234.50"; "1.234" → "1234" (money
  // has at most 2 decimals, so 3 digits after a dot are thousands)
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "")
  else if (/,\d{1,2}$/.test(s) && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".")
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".")
  else s = s.replace(/,/g, "")
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
