import { describe, expect, it } from "vitest"
import {
  detectColumns,
  type ImportRow,
  matchRecipients,
  normalizeDni,
  normalizePhone,
  type TenantClientRow,
} from "./match-recipients"

function client(overrides: Partial<TenantClientRow> & { id: string }): TenantClientRow {
  return {
    name: "Cliente",
    lastName: null,
    dni: null,
    phone: null,
    status: "active",
    ...overrides,
  }
}

function row(n: number, dni: string | null, phone: string | null = null): ImportRow {
  return { row: n, dni, phone }
}

describe("normalizeDni", () => {
  it("strips spaces and punctuation, uppercases", () => {
    expect(normalizeDni(" 12.345.678 ")).toBe("12345678")
    expect(normalizeDni("ab-12 cd")).toBe("AB12CD")
  })
  it("keeps leading zeros", () => {
    expect(normalizeDni("01234567")).toBe("01234567")
  })
  it("accepts numbers (Excel numeric cells)", () => {
    expect(normalizeDni(12345678)).toBe("12345678")
  })
  it("returns null for empty/null", () => {
    expect(normalizeDni(null)).toBeNull()
    expect(normalizeDni("   ")).toBeNull()
    expect(normalizeDni("---")).toBeNull()
  })
})

describe("normalizePhone", () => {
  it("keys on the last 9 digits so country code / spacing do not matter", () => {
    expect(normalizePhone("+51 987 654 321")).toBe("987654321")
    expect(normalizePhone("51987654321")).toBe("987654321")
    expect(normalizePhone("987654321")).toBe("987654321")
    expect(normalizePhone("(987) 654-321")).toBe("987654321")
  })
  it("keeps shorter numbers whole", () => {
    expect(normalizePhone("4567890")).toBe("4567890")
  })
  it("rejects garbage under 6 digits", () => {
    expect(normalizePhone("123")).toBeNull()
    expect(normalizePhone("n/a")).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe("detectColumns", () => {
  it("finds DNI and phone by header, case/accent-insensitive", () => {
    expect(detectColumns(["Nombre", "DNI", "Teléfono"])).toEqual({
      dniCol: 1,
      phoneCol: 2,
      hasHeader: true,
    })
    expect(detectColumns(["celular", "documento"])).toEqual({
      dniCol: 1,
      phoneCol: 0,
      hasHeader: true,
    })
  })
  it("handles a single recognised column", () => {
    expect(detectColumns(["whatsapp"])).toEqual({ dniCol: null, phoneCol: 0, hasHeader: true })
  })
  it("falls back to A=DNI, B=phone when no header is recognised (row is data)", () => {
    expect(detectColumns(["12345678", "987654321"])).toEqual({
      dniCol: 0,
      phoneCol: 1,
      hasHeader: false,
    })
    expect(detectColumns([12345678])).toEqual({ dniCol: 0, phoneCol: null, hasHeader: false })
  })
})

describe("matchRecipients", () => {
  const clients: TenantClientRow[] = [
    client({ id: "c1", name: "Ana", lastName: "Perez", dni: "12345678", phone: "+51 987654321" }),
    client({ id: "c2", name: "Beto", dni: "87654321", phone: "911111111" }),
    client({ id: "c3", name: "Bloqueado", dni: "00000001", status: "blocked" }),
    client({ id: "c4", name: "SoloTel", phone: "922222222" }),
  ]

  it("matches by DNI first, then by phone", () => {
    const r = matchRecipients([row(2, "12.345.678"), row(3, null, "51922222222")], clients)
    expect(r.matched).toEqual([
      { id: "c1", name: "Ana Perez", matchedBy: "dni", row: 2 },
      { id: "c4", name: "SoloTel", matchedBy: "phone", row: 3 },
    ])
    expect(r.rejected).toEqual([])
    expect(r.stats).toEqual({ total: 2, matched: 2, rejected: 0 })
  })

  it("falls back to phone when the DNI is present but unknown", () => {
    const r = matchRecipients([row(2, "99999999", "987654321")], clients)
    expect(r.matched[0]).toMatchObject({ id: "c1", matchedBy: "phone" })
  })

  it("rejects not_found, blocked, duplicate and empty rows with the reason", () => {
    const r = matchRecipients(
      [
        row(2, "12345678"), // ok
        row(3, "99999999"), // not_found
        row(4, "00000001"), // blocked
        row(5, null, "987654321"), // same client as row 2 → duplicate
        row(6, null, null), // empty
        row(7, "", "  "), // empty
      ],
      clients,
    )
    expect(r.matched.map((m) => m.id)).toEqual(["c1"])
    expect(r.rejected).toEqual([
      { row: 3, dni: "99999999", phone: null, reason: "not_found" },
      { row: 4, dni: "00000001", phone: null, reason: "blocked" },
      { row: 5, dni: null, phone: "987654321", reason: "duplicate" },
      { row: 6, dni: null, phone: null, reason: "empty" },
      { row: 7, dni: "", phone: "  ", reason: "empty" },
    ])
    expect(r.stats).toEqual({ total: 6, matched: 1, rejected: 5 })
  })

  it("does not cross tenants: only the provided clients are candidates", () => {
    const r = matchRecipients([row(2, "12345678")], [])
    expect(r.matched).toEqual([])
    expect(r.rejected[0].reason).toBe("not_found")
  })
})
