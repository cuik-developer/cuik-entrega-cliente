import ExcelJS from "exceljs"
import type { ReportData } from "./data-queries"

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0E70DB" },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
}

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
}

function addHeaders(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers)
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.border = BORDER
    cell.alignment = { horizontal: "center" }
  })
}

function styleDataRows(sheet: ExcelJS.Worksheet, startRow: number) {
  for (let i = startRow; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    row.eachCell((cell) => {
      cell.border = BORDER
    })
  }
}

export async function generateReport(tenantName: string, data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik Office - Data Agent"
  wb.created = new Date()

  // ─── Sheet 1: Resumen ─────────────────────────────────────────────
  const resumen = wb.addWorksheet("Resumen")
  resumen.columns = [{ width: 30 }, { width: 20 }]

  resumen.addRow([`Reporte: ${tenantName}`]).font = { bold: true, size: 14 }
  resumen.addRow([`Generado: ${new Date().toLocaleDateString("es-MX")}`])
  resumen.addRow([])

  addHeaders(resumen, ["Metrica", "Valor"])
  resumen.addRow(["Clientes totales", data.summary.totalClients])
  resumen.addRow(["Clientes activos", data.summary.activeClients])
  resumen.addRow(["Visitas totales", data.summary.totalVisits])
  resumen.addRow(["Premios canjeados", data.summary.rewardsRedeemed])
  resumen.addRow(["Promedio visitas/cliente", data.summary.avgVisitsPerClient])
  resumen.addRow([])

  resumen.addRow(["Comparacion Semanal"]).font = { bold: true, size: 12 }
  addHeaders(resumen, ["Periodo", "Visitas", "Clientes Nuevos"])
  resumen.addRow(["Esta semana", data.weekly.thisWeek.visits, data.weekly.thisWeek.newClients])
  resumen.addRow(["Semana anterior", data.weekly.lastWeek.visits, data.weekly.lastWeek.newClients])
  resumen.addRow([])

  resumen.addRow(["Visitas por Dia"]).font = { bold: true, size: 12 }
  addHeaders(resumen, ["Dia", "Visitas"])
  for (const d of data.byDayOfWeek) {
    resumen.addRow([d.day, d.visits])
  }
  styleDataRows(resumen, 5)

  // ─── Sheet 2: Top Clientes ────────────────────────────────────────
  const topSheet = wb.addWorksheet("Top Clientes")
  topSheet.columns = [{ width: 25 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 20 }]

  addHeaders(topSheet, ["Nombre", "Email", "Visitas", "Puntos", "Registro"])
  for (const c of data.topClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    topSheet.addRow([
      name,
      c.email ?? "",
      c.totalVisits,
      c.pointsBalance,
      new Date(c.createdAt).toLocaleDateString("es-MX"),
    ])
  }
  styleDataRows(topSheet, 2)

  // ─── Sheet 3: Visitas Recientes ───────────────────────────────────
  const visitasSheet = wb.addWorksheet("Visitas Recientes")
  visitasSheet.columns = [{ width: 15 }, { width: 25 }, { width: 12 }, { width: 12 }, { width: 12 }]

  addHeaders(visitasSheet, ["Fecha", "Cliente", "# Visita", "Puntos", "Fuente"])
  for (const v of data.recentVisits) {
    visitasSheet.addRow([
      new Date(v.createdAt).toLocaleDateString("es-MX"),
      v.clientName,
      v.visitNum,
      v.points ?? 0,
      v.source,
    ])
  }
  styleDataRows(visitasSheet, 2)

  // ─── Sheet 4: Por Local ───────────────────────────────────────────
  const localSheet = wb.addWorksheet("Por Local")
  localSheet.columns = [{ width: 30 }, { width: 15 }]

  addHeaders(localSheet, ["Local", "Visitas"])
  for (const l of data.byLocation) {
    localSheet.addRow([l.locationName, l.visits])
  }
  styleDataRows(localSheet, 2)

  // ─── Sheet 5: Segmentacion ────────────────────────────────────────
  const segSheet = wb.addWorksheet("Segmentacion")
  segSheet.columns = [{ width: 20 }, { width: 15 }]

  addHeaders(segSheet, ["Segmento", "Clientes"])
  for (const s of data.segmentation) {
    segSheet.addRow([s.segment, s.count])
  }
  segSheet.addRow([])

  segSheet.addRow(["Clientes Inactivos (30+ dias)"]).font = { bold: true, size: 12 }
  addHeaders(segSheet, ["Nombre", "Dias sin visita", "Visitas totales"])
  for (const c of data.inactiveClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    segSheet.addRow([name, c.daysSinceLastVisit, c.totalVisits])
  }
  styleDataRows(segSheet, 2)

  // ─── Generate Buffer ──────────────────────────────────────────────
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
