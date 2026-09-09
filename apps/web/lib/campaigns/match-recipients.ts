/**
 * Pure matching logic for bulk recipient import.
 * No I/O — receives already-parsed rows and the tenant's clients, returns
 * which rows matched a client and which were rejected (and why).
 */

export type MatchReason = "not_found" | "blocked" | "duplicate" | "empty"

export interface TenantClientRow {
  id: string
  name: string
  lastName: string | null
  dni: string | null
  phone: string | null
  status: "active" | "inactive" | "blocked"
}

export interface ImportRow {
  /** 1-based spreadsheet row number, for the rejected report. */
  row: number
  dni: string | null
  phone: string | null
}

export interface MatchedRecipient {
  id: string
  name: string
  matchedBy: "dni" | "phone"
  row: number
}

export interface RejectedRecipient {
  row: number
  dni: string | null
  phone: string | null
  reason: MatchReason
}

export interface MatchResult {
  matched: MatchedRecipient[]
  rejected: RejectedRecipient[]
  stats: { total: number; matched: number; rejected: number }
}

/** Strip everything except A-Z/0-9. Leading zeros are kept on purpose — Peruvian DNIs can start with 0. */
export function normalizeDni(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  return s.length > 0 ? s : null
}

/**
 * Keep digits only and compare the last 9 — so "+51 987 654 321",
 * "51987654321" and "987654321" all key to the same value. Shorter numbers
 * key to themselves; anything under 6 digits is treated as garbage.
 */
export function normalizePhone(raw: unknown): string | null {
  if (raw == null) return null
  const digits = String(raw).replace(/\D/g, "")
  if (digits.length < 6) return null
  return digits.length > 9 ? digits.slice(-9) : digits
}

const DNI_HEADER = /^(dni|documento|doc|nro\s*doc|n[°º]?\s*documento|cedula|ci)$/
const PHONE_HEADER = /(telefono|phone|celular|cel|movil|whatsapp|tel)/

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9°º\s]/g, "")
    .trim()
}

export interface ColumnLayout {
  dniCol: number | null
  phoneCol: number | null
  /** false → first row is data, assume A = DNI, B = phone. */
  hasHeader: boolean
}

export function detectColumns(headerRow: unknown[]): ColumnLayout {
  let dniCol: number | null = null
  let phoneCol: number | null = null
  headerRow.forEach((cell, i) => {
    const h = normalizeHeader(cell)
    if (!h) return
    if (dniCol === null && DNI_HEADER.test(h)) dniCol = i
    else if (phoneCol === null && PHONE_HEADER.test(h)) phoneCol = i
  })
  if (dniCol === null && phoneCol === null) {
    return { dniCol: 0, phoneCol: headerRow.length > 1 ? 1 : null, hasHeader: false }
  }
  return { dniCol, phoneCol, hasHeader: true }
}

export function matchRecipients(rows: ImportRow[], clients: TenantClientRow[]): MatchResult {
  const byDni = new Map<string, TenantClientRow>()
  const byPhone = new Map<string, TenantClientRow>()
  for (const c of clients) {
    const d = normalizeDni(c.dni)
    if (d && !byDni.has(d)) byDni.set(d, c)
    const p = normalizePhone(c.phone)
    if (p && !byPhone.has(p)) byPhone.set(p, c)
  }

  const matched: MatchedRecipient[] = []
  const rejected: RejectedRecipient[] = []
  const seen = new Set<string>()

  for (const r of rows) {
    const d = normalizeDni(r.dni)
    const p = normalizePhone(r.phone)
    if (!d && !p) {
      rejected.push({ row: r.row, dni: r.dni, phone: r.phone, reason: "empty" })
      continue
    }

    let client: TenantClientRow | undefined
    let matchedBy: "dni" | "phone" = "dni"
    if (d) client = byDni.get(d)
    if (!client && p) {
      client = byPhone.get(p)
      matchedBy = "phone"
    }

    if (!client) {
      rejected.push({ row: r.row, dni: r.dni, phone: r.phone, reason: "not_found" })
      continue
    }
    if (client.status === "blocked") {
      rejected.push({ row: r.row, dni: r.dni, phone: r.phone, reason: "blocked" })
      continue
    }
    if (seen.has(client.id)) {
      rejected.push({ row: r.row, dni: r.dni, phone: r.phone, reason: "duplicate" })
      continue
    }

    seen.add(client.id)
    matched.push({
      id: client.id,
      name: [client.name, client.lastName].filter(Boolean).join(" "),
      matchedBy,
      row: r.row,
    })
  }

  return {
    matched,
    rejected,
    stats: { total: rows.length, matched: matched.length, rejected: rejected.length },
  }
}
