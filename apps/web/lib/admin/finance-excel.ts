import ExcelJS from "exceljs"
import type { FinanceDashboard } from "./finance-dashboard"

/**
 * The Tablero as a workbook: "Resumen" (the figures at the top of the page),
 * "Mes a mes" (one row per month, cash and accrual side by side, projected
 * months marked) and "Préstamos". Soles throughout; USD already converted.
 */
export async function buildFinanceExcel(d: FinanceDashboard): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const money = "#,##0.00;[Red]-#,##0.00"
  const header = (ws: ExcelJS.Worksheet, cols: number) => {
    const row = ws.getRow(1)
    row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E70DB" } }
    row.alignment = { vertical: "middle", horizontal: "center" }
    row.height = 26
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } }
  }

  const ws1 = wb.addWorksheet("Resumen")
  ws1.columns = [
    { header: "Indicador", key: "k", width: 46 },
    { header: "Valor (S/)", key: "v", width: 20 },
    { header: "Nota", key: "n", width: 50 },
  ]
  header(ws1, 3)
  const cur = d.current
  const rows: Array<[string, number | string, string]> = [
    ["Periodo", `${d.range.from} a ${d.range.to}`, `Mes actual: ${d.range.todayMonth}`],
    [
      "Tipo de cambio del mes",
      d.fx.rate,
      d.fx.estimated ? "Estimado: no hay valor cargado" : "Cargado en Finanzas",
    ],
    ["Ingresos del mes (caja)", (cur?.incomeCash ?? 0) + (cur?.projectedCash ?? 0), ""],
    [
      "Ingresos del mes (devengado)",
      (cur?.incomeAccrual ?? 0) + (cur?.projectedAccrual ?? 0),
      "Facturas repartidas en los meses que pagan + proyección",
    ],
    ["Costos del mes (caja)", cur?.costCash ?? 0, "Sin cuotas de préstamo"],
    ["Costos del mes (devengado)", cur?.costAccrual ?? 0, ""],
    ["Cuotas de préstamo del mes", cur?.loanPayments ?? 0, ""],
    ["Neto del mes (caja)", cur?.netCash ?? 0, "Negativo = lo que puso el socio"],
    ["Neto del mes (devengado)", cur?.netAccrual ?? 0, ""],
    ["Comercios pagando", d.merchants.paying, ""],
    ["Ingreso mensual esperado de comercios", d.merchants.expectedMonthlyPen, ""],
    [
      "Salida mensual a cubrir",
      d.breakEven.outflowPen,
      "Costos fijos del mes (devengado) + cuotas",
    ],
    [
      "Ticket promedio por comercio",
      d.breakEven.ticketPen,
      d.breakEven.ticketIsDefault ? "Promedio actual" : "Escrito a mano",
    ],
    [
      "Comercios para el punto de equilibrio",
      d.breakEven.merchantsNeeded ?? "",
      d.breakEven.merchantsNeeded === null
        ? ""
        : `Faltan ${Math.max(0, d.breakEven.merchantsNeeded - d.merchants.paying)}`,
    ],
    ["Saldo de préstamos", d.loans.reduce((a, l) => a + l.balancePen, 0), ""],
    ["Puesto por el socio", d.recovery.invested, "Aportes registrados"],
    ["Devuelto al socio", d.recovery.returned, ""],
    ["Pendiente de recuperar", d.recovery.outstanding, ""],
    [
      "Mes de recupero",
      d.recovery.recoveredIn ?? "Fuera del periodo",
      d.recovery.projected ? "Proyectado" : "",
    ],
    ["Neto acumulado hasta hoy (caja)", d.totals.toDate.netCash, ""],
    ["Neto proyectado (caja)", d.totals.projected.netCash, "Meses posteriores al actual"],
  ]
  for (const [k, v, n] of rows) {
    const r = ws1.addRow({ k, v, n })
    if (typeof v === "number") r.getCell("v").numFmt = money
  }

  const ws2 = wb.addWorksheet("Mes a mes")
  ws2.columns = [
    { header: "Mes", key: "month", width: 10 },
    { header: "Tipo", key: "kind", width: 11 },
    { header: "Ingresos caja", key: "incomeCash", width: 14 },
    { header: "Proyección caja", key: "projectedCash", width: 15 },
    { header: "Costos caja", key: "costCash", width: 12 },
    { header: "Cuotas", key: "loanPayments", width: 11 },
    { header: "Neto caja", key: "netCash", width: 12 },
    { header: "Acumulado caja", key: "cumulativeCash", width: 15 },
    { header: "Ingresos devengado", key: "incomeAccrual", width: 18 },
    { header: "Proyección devengado", key: "projectedAccrual", width: 19 },
    { header: "Costos devengado", key: "costAccrual", width: 16 },
    { header: "Neto devengado", key: "netAccrual", width: 15 },
    { header: "Acumulado devengado", key: "cumulativeAccrual", width: 19 },
    { header: "Aportes del socio", key: "contributions", width: 16 },
    { header: "Cubierto por el socio (auto)", key: "autoContribution", width: 24 },
    { header: "Devoluciones", key: "returns", width: 13 },
    { header: "TC estimado", key: "fx", width: 11 },
  ]
  header(ws2, 17)
  for (const r of d.rows) {
    const row = ws2.addRow({
      ...r,
      kind: r.month > d.range.todayMonth ? "Proyectado" : "Real",
      fx: r.fxEstimated ? "Sí" : "",
    })
    for (const key of [
      "incomeCash",
      "projectedCash",
      "costCash",
      "loanPayments",
      "netCash",
      "cumulativeCash",
      "incomeAccrual",
      "projectedAccrual",
      "costAccrual",
      "netAccrual",
      "cumulativeAccrual",
      "contributions",
      "autoContribution",
      "returns",
    ]) {
      row.getCell(key).numFmt = money
    }
    if (r.month > d.range.todayMonth) row.font = { color: { argb: "FF6B7280" } }
  }

  const ws3 = wb.addWorksheet("Préstamos")
  ws3.columns = [
    { header: "Préstamo", key: "name", width: 28 },
    { header: "Moneda", key: "currency", width: 8 },
    { header: "Cuota", key: "installment", width: 12 },
    { header: "Saldo", key: "balance", width: 14 },
    { header: "Saldo (S/)", key: "balancePen", width: 14 },
    { header: "Cuotas pendientes", key: "remaining", width: 16 },
    { header: "Última cuota", key: "lastMonth", width: 12 },
  ]
  header(ws3, 7)
  for (const l of d.loans) {
    const row = ws3.addRow(l)
    for (const key of ["installment", "balance", "balancePen"]) row.getCell(key).numFmt = money
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
