import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { buildCloseTemplate, parseCloseWorkbook } from "./close-excel"

const line = {
  book: "V" as const,
  docType: "01",
  serie: "F001",
  numero: "7",
  date: "2026-11-05",
  counterpartyDoc: "20606652055",
  counterpartyName: "MASCOTA VELOZ S.A.C.",
  currency: "PEN" as const,
  fxRate: null,
  base: 211.86,
  igv: 38.14,
  noGravado: 0,
  total: 250,
  note: null,
}

describe("close template round trip", () => {
  it("reads back what the accountant fills in", async () => {
    const buf = await buildCloseTemplate({
      month: "2026-11",
      issuer: { razonSocial: "CUIK E.I.R.L.", ruc: "20606652055" },
      panel: {
        VENTAS_BASE: 278.81,
        IGV_DEBITO: 50.19,
        IGV_CREDITO: 0,
        SALDO_FAVOR_ANTERIOR: 0,
        RETENCIONES_PERCEPCIONES: 0,
        IGV_A_PAGAR: 50,
        SALDO_FAVOR_SIGUIENTE: 0,
        PAGO_A_CUENTA_RENTA: 3,
      },
      lines: [line],
    })

    // The accountant fills the "Contador" column and adds a purchase.
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const res = wb.getWorksheet("Resumen")
    res?.eachRow((row) => {
      const code = String(row.getCell(1).value)
      if (code === "IGV_A_PAGAR") row.getCell(4).value = 41
      if (code === "PAGO_A_CUENTA_RENTA") row.getCell(4).value = "3"
      if (code === "NUMERO_ORDEN") row.getCell(4).value = "750123456"
    })
    const reg = wb.getWorksheet("Registro")
    reg?.addRow([
      "C",
      "1",
      "f002",
      "000045",
      "2026-11-10",
      "20100047218",
      "Restaurante",
      "PEN",
      null,
      50,
      9,
      0,
      59,
      null,
    ])
    reg?.addRow(["X", "01", "F009", "1", null, null, null, "PEN", null, 1, 0, 0, 1, null])
    const edited = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const parsed = await parseCloseWorkbook(edited)
    expect(parsed.summary.IGV_A_PAGAR).toBe(41)
    expect(parsed.summary.PAGO_A_CUENTA_RENTA).toBe(3)
    expect(parsed.summary.NUMERO_ORDEN).toBe("750123456")
    expect(parsed.summary.VENTAS_BASE).toBeUndefined()
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[1]).toMatchObject({ book: "C", docType: "01", serie: "F002", total: 59 })
    expect(parsed.errors).toEqual(["Registro, fila 4: LIBRO debe ser V o C"])
  })

  it("explains a workbook without the expected sheets", async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet("Hoja1").addRow(["x"])
    const parsed = await parseCloseWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    expect(parsed.errors).toContain("Falta la hoja «Resumen»")
    expect(parsed.errors).toContain("Falta la hoja «Registro»")
  })
})
