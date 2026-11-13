import { describe, expect, it } from "vitest"
import {
  amountsAddUp,
  docSign,
  documentTotals,
  normalizeNumero,
  parseSerieNumero,
  saleAmountsFromInvoice,
  toPen,
} from "./documents"

describe("parseSerieNumero", () => {
  it("normalizes case, spaces and leading zeros", () => {
    expect(parseSerieNumero("F001-000123")).toEqual({ serie: "F001", numero: "123" })
    expect(parseSerieNumero(" f001 - 123 ")).toEqual({ serie: "F001", numero: "123" })
    expect(parseSerieNumero("E001-45")).toEqual({ serie: "E001", numero: "45" })
  })
  it("rejects anything else", () => {
    expect(parseSerieNumero("123")).toBeNull()
    expect(parseSerieNumero("F0011-1")).toBeNull()
    expect(parseSerieNumero("F001-")).toBeNull()
    expect(parseSerieNumero("")).toBeNull()
  })
})

describe("normalizeNumero", () => {
  it("drops leading zeros and rejects non digits", () => {
    expect(normalizeNumero("000045")).toBe("45")
    expect(normalizeNumero("4a")).toBeNull()
  })
})

describe("amounts", () => {
  it("splits a merchant invoice that includes IGV", () => {
    expect(saleAmountsFromInvoice(250, true, 0.18)).toEqual({
      baseGravada: 211.86,
      baseNoGravada: 0,
      igv: 38.14,
      total: 250,
    })
  })
  it("checks that the parts add up to the total", () => {
    expect(amountsAddUp({ baseGravada: 50, baseNoGravada: 5, igv: 9, total: 64 })).toBe(true)
    expect(amountsAddUp({ baseGravada: 50, baseNoGravada: 0, igv: 9, total: 64 })).toBe(false)
    expect(amountsAddUp({ baseGravada: 211.86, baseNoGravada: 0, igv: 38.13, total: 250 })).toBe(
      true,
    )
  })
  it("converts USD with the document rate", () => {
    expect(toPen(12, "USD", 3.75)).toBe(45)
    expect(toPen(12, "PEN", null)).toBe(12)
  })
})

describe("documentTotals", () => {
  const base = { status: "registered" as const, currency: "PEN" as const, fxRate: null }
  it("subtracts credit notes and skips void documents", () => {
    const t = documentTotals([
      { ...base, docType: "01", baseGravada: 211.86, baseNoGravada: 0, igv: 38.14, total: 250 },
      { ...base, docType: "07", baseGravada: 42.37, baseNoGravada: 0, igv: 7.63, total: 50 },
      {
        ...base,
        docType: "01",
        status: "void",
        baseGravada: 100,
        baseNoGravada: 0,
        igv: 18,
        total: 118,
      },
      {
        ...base,
        docType: "91",
        currency: "USD",
        fxRate: 3.7,
        baseGravada: 0,
        baseNoGravada: 12,
        igv: 0,
        total: 12,
      },
    ])
    expect(docSign("07")).toBe(-1)
    expect(t).toEqual({
      count: 3,
      baseGravada: 169.49,
      baseNoGravada: 44.4,
      igv: 30.51,
      total: 244.4,
    })
  })
})

describe("documentSchema", async () => {
  const { documentSchema } = await import("@cuik/shared/validators")
  const sale = {
    direction: "sale",
    docType: "01",
    serie: "F001",
    numero: "7",
    issueDate: "2026-11-05",
    taxPeriod: "2026-11",
    counterpartyName: "Cliente",
    currency: "PEN",
    baseGravada: 211.86,
    baseNoGravada: 0,
    igv: 38.14,
    total: 250,
  }
  it("accepts a regular sale", () => {
    expect(documentSchema.safeParse(sale).success).toBe(true)
  })
  it("rejects negative amounts (credit notes subtract by type)", () => {
    expect(
      documentSchema.safeParse({
        ...sale,
        docType: "07",
        baseGravada: -42.37,
        igv: -7.63,
        total: -50,
      }).success,
    ).toBe(false)
  })
  it("rejects impossible dates and types Cuik does not issue", () => {
    expect(documentSchema.safeParse({ ...sale, issueDate: "2026-13-40" }).success).toBe(false)
    expect(documentSchema.safeParse({ ...sale, issueDate: "2026-02-30" }).success).toBe(false)
    expect(documentSchema.safeParse({ ...sale, docType: "91" }).success).toBe(false)
  })
})
