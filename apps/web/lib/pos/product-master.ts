import { cellText } from "@/lib/loyalty/impact/columns"
import type { SalesSheet } from "@/lib/loyalty/impact/parse"

/**
 * The merchant's product master: one row per SKU with its category, class
 * and subclass. Read with the same xlsx/csv reader as the sales file; the
 * headers are detected here and the operator sees what was recognised.
 */

export const MASTER_FIELDS = [
  "sku",
  "name",
  "category",
  "class",
  "subclass",
  "brand",
  "packSize",
  "durationDays",
] as const
export type MasterField = (typeof MASTER_FIELDS)[number]

export const MASTER_FIELD_LABELS: Record<MasterField, string> = {
  sku: "SKU / código",
  name: "Nombre del producto",
  category: "Categoría",
  class: "Clase",
  subclass: "Subclase",
  brand: "Marca",
  packSize: "Presentación",
  durationDays: "Duración (días)",
}

export type MasterMapping = Record<MasterField, number | null>

function norm(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Priority order: the first field whose pattern matches takes the column. */
const PATTERNS: { field: MasterField; test: RegExp }[] = [
  { field: "subclass", test: /sub ?clase|sub ?class|sub ?categoria|sub ?category/ },
  { field: "class", test: /\bclase\b|\bclass\b|\blinea\b/ },
  { field: "category", test: /categoria|category|familia|rubro|departamento/ },
  {
    field: "sku",
    test: /\bsku\b|codigo interno|referencia interna|default_code|\bcodigo\b|^cod\b|^code|referencia|\bitem\b|articulo|^id$/,
  },
  { field: "name", test: /nombre|descripcion|producto|product|name|detalle/ },
  { field: "brand", test: /\bmarca\b|\bbrand\b/ },
  { field: "durationDays", test: /duraci|\bdias\b|\bdays\b|rinde/ },
  { field: "packSize", test: /presentaci|tama|peso|\bsize\b|contenido|formato/ },
]

export function emptyMasterMapping(): MasterMapping {
  return Object.fromEntries(MASTER_FIELDS.map((f) => [f, null])) as MasterMapping
}

export function detectMasterMapping(headers: unknown[]): MasterMapping {
  const mapping = emptyMasterMapping()
  const taken = new Set<number>()
  const normalized = headers.map(norm)
  for (const { field, test } of PATTERNS) {
    const idx = normalized.findIndex((h, i) => !taken.has(i) && h !== "" && test.test(h))
    if (idx >= 0) {
      mapping[field] = idx
      taken.add(idx)
    }
  }
  return mapping
}

/** Reads a mapping sent by the client: only known fields, only valid, distinct column indexes. */
export function parseMasterMapping(raw: unknown, columnCount: number): MasterMapping | null {
  if (!raw || typeof raw !== "object") return null
  const mapping = emptyMasterMapping()
  const used = new Set<number>()
  for (const field of MASTER_FIELDS) {
    const v = (raw as Record<string, unknown>)[field]
    if (v === null || v === undefined || v === "") continue
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10)
    if (!Number.isInteger(n) || n < 0 || n >= columnCount) return null
    if (used.has(n)) return null
    used.add(n)
    mapping[field] = n
  }
  return mapping
}

export type MasterRow = {
  sku: string
  name: string | null
  category: string | null
  class: string | null
  subclass: string | null
  brand: string | null
  packSize: string | null
  durationDays: number | null
}

export type MasterBuild = {
  rows: MasterRow[]
  rowsTotal: number
  /** Rows without a SKU (skipped). */
  rowsWithoutSku: number
  /** SKUs that appeared more than once (the last row wins). */
  duplicates: number
}

/** A SKU as the POS and the master both write it: trimmed, no inner spaces, upper case. */
export function normalizeSku(value: unknown): string | null {
  const s = cellText(value)
  if (!s) return null
  // "12345.0" from a numeric cell is "12345".
  const cleaned = /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, "") : s
  const out = cleaned.replace(/\s+/g, "").toUpperCase()
  return out.length > 0 && out.length <= 64 ? out : null
}

/** "45", "45 días", "45.0" → 45; anything else null. */
function durationOf(value: unknown): number | null {
  const s = cellText(value)
  if (!s) return null
  const n = Number.parseFloat(s.replace(",", "."))
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? Math.round(n) : null
}

export function buildMaster(sheet: SalesSheet, mapping: MasterMapping): MasterBuild {
  const col = (row: unknown[], f: MasterField) =>
    mapping[f] === null ? null : (row[mapping[f] as number] ?? null)
  const bySku = new Map<string, MasterRow>()
  let rowsWithoutSku = 0
  let duplicates = 0
  for (const row of sheet.rows) {
    const sku = normalizeSku(col(row, "sku"))
    if (!sku) {
      rowsWithoutSku++
      continue
    }
    if (bySku.has(sku)) duplicates++
    bySku.set(sku, {
      sku,
      name: cellText(col(row, "name"))?.slice(0, 200) ?? null,
      category: cellText(col(row, "category"))?.slice(0, 120) ?? null,
      class: cellText(col(row, "class"))?.slice(0, 120) ?? null,
      subclass: cellText(col(row, "subclass"))?.slice(0, 120) ?? null,
      brand: cellText(col(row, "brand"))?.slice(0, 80) ?? null,
      packSize: cellText(col(row, "packSize"))?.slice(0, 60) ?? null,
      durationDays: durationOf(col(row, "durationDays")),
    })
  }
  return { rows: [...bySku.values()], rowsTotal: sheet.rows.length, rowsWithoutSku, duplicates }
}
