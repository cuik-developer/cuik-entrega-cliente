import { type ColumnMapping, IMPACT_FIELDS, type ImpactField } from "./types"

/**
 * Column detection for a sales file. Headers are matched against Spanish and
 * English wording (Odoo's POS export included); the operator confirms or
 * fixes the mapping on screen before anything is processed.
 */

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Patterns in priority order: the first field whose pattern matches wins the column. */
const PATTERNS: { field: ImpactField; test: RegExp }[] = [
  {
    field: "orderRef",
    test: /^ref|ref\.? de la orden|referencia|n(um|º|o)\.? ?(de )?(orden|pedido|venta|ticket|comprobante)|^orden$|^order|^pedido|^ticket|^comprobante/,
  },
  {
    field: "idType",
    test: /tipo de (identificacion|documento|doc)|tipo doc|id type|document type/,
  },
  {
    field: "dni",
    test: /\bdni\b|numero de identificacion|identificacion fiscal|n(um|º|o)\.? ?(de )?(documento|identificacion)|\bnif\b|\bruc\b|documento|vat/,
  },
  { field: "phone", test: /celular|telefono|phone|movil|whatsapp/ },
  { field: "store", test: /punto de venta|tienda|local|sucursal|store|sede|shop|branch/ },
  {
    field: "cashier",
    test: /cajer|vendedor|atendido por|usuario|cashier|employee|empleado|responsable/,
  },
  { field: "date", test: /fecha|date|\bdia\b/ },
  {
    field: "amount",
    test: /precio pagado|total pagado|importe pagado|pagado|total|monto|importe|amount|subtotal|precio/,
  },
  { field: "name", test: /cliente|nombre|customer|contacto|razon social|partner/ },
]

export function emptyMapping(): ColumnMapping {
  return Object.fromEntries(IMPACT_FIELDS.map((f) => [f, null])) as ColumnMapping
}

/** Best-guess mapping from the header row. Columns already taken are not reused. */
export function detectMapping(headers: unknown[]): ColumnMapping {
  const mapping = emptyMapping()
  const taken = new Set<number>()
  const normalized = headers.map(normalizeHeader)
  for (const { field, test } of PATTERNS) {
    if (mapping[field] !== null) continue
    const idx = normalized.findIndex((h, i) => !taken.has(i) && h !== "" && test.test(h))
    if (idx >= 0) {
      mapping[field] = idx
      taken.add(idx)
    }
  }
  return mapping
}

/** The fields a file cannot do without. */
export const REQUIRED_FIELDS: ImpactField[] = ["dni", "date", "amount"]

export function missingRequiredFields(mapping: ColumnMapping): ImpactField[] {
  return REQUIRED_FIELDS.filter((f) => mapping[f] === null)
}

/** Reads a mapping sent by the client: only known fields, only valid column indexes. */
export function parseMapping(raw: unknown, columnCount: number): ColumnMapping | null {
  if (!raw || typeof raw !== "object") return null
  const mapping = emptyMapping()
  const used = new Set<number>()
  for (const field of IMPACT_FIELDS) {
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

// --- Cell normalization ---

/**
 * Digits only; a Peruvian DNI has 8 and a carné de extranjería 9. Anything
 * else (RUC with 11, passport, blank) is no personal document.
 */
export function normalizeDni(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (digits.length !== 8 && digits.length !== 9) return null
  // 00000000, 11111111…: placeholders typed at the till.
  if (/^(\d)\1+$/.test(digits)) return null
  return digits
}

/** Names the till uses for a walk-in: not a person. */
export function isPlaceholderName(name: unknown): boolean {
  return /^(invitad|cliente final|publico|público|consumidor|varios|general|sin nombre|anonimo|anónimo)/i.test(
    String(name ?? "").trim(),
  )
}

export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (digits.length < 6) return null
  return digits.length > 9 && digits.startsWith("51") ? digits.slice(2) : digits
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * A cell to "YYYY-MM-DD". Excel dates arrive as Date objects (UTC midnight
 * for a date cell, or the real instant); strings may be "31/10/2026",
 * "31/10/2026 18:04", "2026-10-31", "2026-10-31T23:04:00". Day-first when
 * ambiguous (Peru). Null when unreadable.
 */
export function normalizeDay(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  }
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30).
    if (value < 20000 || value > 80000) return null
    const ms = Math.round((value - 25569) * 86400000)
    return normalizeDay(new Date(ms))
  }
  const s = String(value ?? "").trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
    return `${m[3]}-${pad(mo)}-${pad(d)}`
  }
  return null
}

/** "S/ 1,234.50", "1234,5", 1234.5 -> 1234.5. NaN -> 0. */
export function normalizeAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  let s = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .trim()
  if (!s) return 0
  // "1.234,50" (es) vs "1,234.50" (en): the last separator is the decimal one.
  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".")
  else s = s.replace(/,/g, "")
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

export function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: unknown }
    if (v.richText)
      return (
        v.richText
          .map((t) => t.text)
          .join("")
          .trim() || null
      )
    if (v.result !== undefined) return cellText(v.result)
    if (typeof v.text === "string") return v.text.trim() || null
    return null
  }
  const s = String(value).trim()
  return s || null
}

/** ExcelJS cell values to a plain value (string, number or Date) for the normalizers. */
export function cellValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date || typeof value === "number" || typeof value === "string") return value
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: unknown }
    if (v.richText) return v.richText.map((t) => t.text).join("")
    if (v.result !== undefined) return cellValue(v.result)
    if (typeof v.text === "string") return v.text
    return null
  }
  return String(value)
}
