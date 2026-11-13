import { describe, expect, it } from "vitest"
import { splitIgv } from "./issuers"
import {
  annualEstimate,
  annualIncomeTax,
  EMPTY_MONTH,
  type MonthDocs,
  monthsTax,
  monthTax,
  reserveRate,
} from "./tax"

const RMT = {
  igvRate: 0.18,
  monthlyRate: 0.01,
  annualBrackets: [
    { upToUit: 15, rate: 0.1 },
    { upToUit: null, rate: 0.295 },
  ],
}

/** The accountant's example: Mascota Veloz S/ 250 + Don Clarito S/ 79, IGV included. */
function exampleMonth(): MonthDocs {
  const mv = splitIgv(250, true, 0.18)
  const dc = splitIgv(79, true, 0.18)
  return {
    ...EMPTY_MONTH,
    salesBase: mv.base + dc.base,
    salesIgv: mv.igv + dc.igv,
    salesTotal: 329,
  }
}

describe("monthTax (accountant's example)", () => {
  const t = monthTax("2026-11", exampleMonth(), RMT, 0)
  it("matches base, IGV and pago a cuenta of the report", () => {
    expect(t.salesBase).toBe(278.81)
    expect(t.salesIgv).toBe(50.19)
    expect(t.igvToPayExact).toBe(50.19)
    expect(t.incomeAdvanceExact).toBe(2.79)
  })
  it("rounds what is declared in the PDT 621 to whole soles: S/ 53", () => {
    expect(t.igvToPay).toBe(50)
    expect(t.incomeAdvance).toBe(3)
    expect(t.payToSunat).toBe(53)
  })
  it("sets aside 10 % of the base for the annual return", () => {
    expect(reserveRate(RMT)).toBe(0.1)
    expect(t.annualReserve).toBe(27.88)
    expect(t.totalSetAside).toBe(80.88)
    expect(t.netForCuik).toBe(248.12)
  })
})

describe("IGV credit", () => {
  it("subtracts purchases with credit and carries a saldo a favor", () => {
    const docs = { ...exampleMonth(), purchaseIgvCredit: 60 }
    const rows = monthsTax(
      ["2026-11", "2026-12"],
      (m) => (m === "2026-11" ? docs : exampleMonth()),
      () => RMT,
    )
    expect(rows[0]?.igvToPay).toBe(0)
    expect(rows[0]?.igvCreditNext).toBe(9.81)
    expect(rows[1]?.igvCreditCarried).toBe(9.81)
    expect(rows[1]?.igvToPayExact).toBe(40.38)
    expect(rows[1]?.igvToPay).toBe(40)
  })
  it("skips months without a regime and does not carry across them", () => {
    const rows = monthsTax(
      ["2026-10", "2026-11"],
      () => exampleMonth(),
      (m) => (m < "2026-11" ? null : RMT),
    )
    expect(rows.map((r) => r.month)).toEqual(["2026-11"])
  })
})

describe("RER has no annual reserve", () => {
  it("reserves nothing when there are no annual brackets", () => {
    const t = monthTax(
      "2026-11",
      exampleMonth(),
      { ...RMT, monthlyRate: 0.015, annualBrackets: [] },
      0,
    )
    expect(t.annualReserve).toBe(0)
    expect(t.incomeAdvance).toBe(4)
  })
})

describe("annual estimate", () => {
  it("applies 10 % up to 15 UIT and 29.5 % above", () => {
    expect(annualIncomeTax(50_000, RMT.annualBrackets, 5500)).toBe(5000)
    expect(annualIncomeTax(100_000, RMT.annualBrackets, 5500)).toBe(8250 + 0.295 * 17_500)
    expect(annualIncomeTax(1_000, RMT.annualBrackets, null)).toBeNull()
    expect(annualIncomeTax(-10, RMT.annualBrackets, 5500)).toBe(0)
  })
  it("compares the reserve with tax on profit minus advances", () => {
    const rows = monthsTax(
      ["2026-11", "2026-12"],
      (m) =>
        m === "2026-12" ? { ...exampleMonth(), purchaseBaseDeductible: 100 } : exampleMonth(),
      () => RMT,
    )
    const e = annualEstimate(rows, RMT, 5500)
    expect(e.income).toBe(557.62)
    expect(e.netIncome).toBe(457.62)
    expect(e.tax).toBe(45.76)
    expect(e.advances).toBe(6)
    expect(e.balanceDue).toBe(39.76)
    expect(e.reserved).toBe(55.76)
    expect(e.reserveMargin).toBe(16)
  })
})

describe("pago a cuenta rounding", () => {
  it("rounds the exact product once", () => {
    const t = monthTax("2026-11", { ...EMPTY_MONTH, salesBase: 249.5, salesTotal: 294.41 }, RMT, 0)
    expect(t.incomeAdvanceExact).toBe(2.5)
    expect(t.incomeAdvance).toBe(2)
  })
})
