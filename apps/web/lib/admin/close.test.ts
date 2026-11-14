import { describe, expect, it } from "vitest"
import {
  lineKey,
  normHeader,
  panelSnapshot,
  parseAmount,
  reconcileLines,
  reconcileSummary,
} from "./close"
import { EMPTY_MONTH, monthTax } from "./tax"

const RMT = {
  igvRate: 0.18,
  monthlyRate: 0.01,
  annualBrackets: [
    { upToUit: 15, rate: 0.1 },
    { upToUit: null, rate: 0.295 },
  ],
}
const nov = monthTax(
  "2026-11",
  { ...EMPTY_MONTH, salesBase: 278.81, salesIgv: 50.19, salesTotal: 329 },
  RMT,
  0,
)

describe("reconcileSummary", () => {
  const panel = panelSnapshot(nov)
  it("takes the PDT figures from the month", () => {
    expect(panel.IGV_A_PAGAR).toBe(50)
    expect(panel.PAGO_A_CUENTA_RENTA).toBe(3)
    expect(panel.VENTAS_BASE).toBe(278.81)
  })
  it("treats up to S/ 1 as rounding and flags real differences", () => {
    const rows = reconcileSummary(panel, {
      VENTAS_BASE: 279,
      IGV_A_PAGAR: 52,
      PAGO_A_CUENTA_RENTA: 3,
      NUMERO_ORDEN: "123",
    })
    const by = Object.fromEntries(rows.map((r) => [r.code, r]))
    expect(by.VENTAS_BASE?.status).toBe("ok")
    expect(by.IGV_A_PAGAR?.status).toBe("diff")
    expect(by.IGV_A_PAGAR?.diff).toBe(2)
    expect(by.PAGO_A_CUENTA_RENTA?.status).toBe("ok")
    expect(by.IGV_CREDITO?.status).toBe("missing")
  })
})

describe("reconcileLines", () => {
  const sale = {
    book: "V" as const,
    docType: "01",
    serie: "F001",
    numero: "7",
    counterpartyDoc: "20606652055",
    counterpartyName: "MV",
    total: 250,
    igv: 38.14,
  }
  it("matches regardless of leading zeros and case", () => {
    expect(lineKey({ ...sale, numero: "000007", serie: "f001", docType: "1" })).toBe(lineKey(sale))
  })
  it("classifies matched, different, and one-sided documents", () => {
    const purchase = { ...sale, book: "C" as const, serie: "F002", numero: "45", total: 59, igv: 9 }
    const res = reconcileLines(
      [sale, purchase, { ...sale, numero: "8" }],
      [
        { ...sale, total: 250, igv: 38.14 },
        { ...purchase, total: 60, igv: 9.15 },
        { ...sale, numero: "9" },
      ],
    )
    const status = Object.fromEntries(res.map((r) => [r.key, r.status]))
    expect(status[lineKey(sale)]).toBe("ok")
    expect(status[lineKey(purchase)]).toBe("amount")
    expect(status[lineKey({ ...sale, numero: "8" })]).toBe("only_panel")
    expect(status[lineKey({ ...sale, numero: "9" })]).toBe("only_accountant")
    expect(res[0]?.status).toBe("amount")
  })
  it("keeps purchases of different suppliers apart", () => {
    const a = { ...sale, book: "C" as const, counterpartyDoc: "20100047218" }
    const b = { ...a, counterpartyDoc: "20131312955" }
    expect(lineKey(a)).not.toBe(lineKey(b))
  })
})

describe("parsing helpers", () => {
  it("normalizes headers", () => {
    expect(normHeader(" Razón Social ")).toBe("razon_social")
    expect(normHeader("DOC_CONTRAPARTE")).toBe("doc_contraparte")
  })
  it("reads amounts in common formats", () => {
    expect(parseAmount(1234.5)).toBe(1234.5)
    expect(parseAmount("1,234.50")).toBe(1234.5)
    expect(parseAmount("1.234,50")).toBe(1234.5)
    expect(parseAmount("S/ 50")).toBe(50)
    expect(parseAmount("12,5")).toBe(12.5)
    expect(parseAmount("")).toBeNull()
    expect(parseAmount("abc")).toBeNull()
  })
})

describe("duplicates and thousands", () => {
  it("flags a document the accountant listed twice", () => {
    const l = {
      book: "V" as const,
      docType: "01",
      serie: "F001",
      numero: "7",
      counterpartyDoc: null,
      counterpartyName: null,
      total: 250,
      igv: 38.14,
    }
    const res = reconcileLines([l], [l, l])
    expect(res.map((r) => r.status).sort()).toEqual(["duplicate", "ok"])
  })
  it("reads dots as thousands when there are three digits after them", () => {
    expect(parseAmount("1.234")).toBe(1234)
    expect(parseAmount("12.345.678")).toBe(12345678)
    expect(parseAmount("1.23")).toBe(1.23)
  })
})
