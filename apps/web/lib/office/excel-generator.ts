import ExcelJS from "exceljs"
import type { ReportData } from "./data-queries"

// ─── Design Tokens ────────────────────────────────────────────────────

const CUIK_BLUE = "FF0E70DB"
const WHITE = "FFFFFFFF"
const LIGHT_GRAY = "FFF5F7FA"
const BORDER_COLOR = "FFD1D5DB"
const GREEN = "FF22C55E"
const YELLOW = "FFF59E0B"
const RED = "FFEF4444"
const DARK_RED = "FFDC2626"
const LIGHT_GREEN = "FFF0FDF4"
const LIGHT_RED = "FFFEF2F2"
const DARK_TEXT = "FF1E293B"
const MUTED_TEXT = "FF64748B"

const FONT_BASE: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: DARK_TEXT } }
const FONT_HEADER: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  bold: true,
  color: { argb: WHITE },
}
const FONT_TITLE: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 14,
  bold: true,
  color: { argb: DARK_TEXT },
}
const FONT_SECTION: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 12,
  bold: true,
  color: { argb: CUIK_BLUE },
}
const FONT_KPI_VALUE: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 22,
  bold: true,
  color: { argb: CUIK_BLUE },
}
const FONT_KPI_LABEL: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 10,
  color: { argb: MUTED_TEXT },
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: CUIK_BLUE },
}
const ALT_ROW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: LIGHT_GRAY },
}
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
}

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
}

function fillColor(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } }
}

// ─── Sheet Utilities ──────────────────────────────────────────────────

function addSheetHeader(sheet: ExcelJS.Worksheet, tenantName: string, cols: number) {
  const dateStr = new Date().toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  // Row 1: CUIK branding
  const brandRow = sheet.addRow(["CUIK"])
  brandRow.font = { name: "Calibri", size: 18, bold: true, color: { argb: CUIK_BLUE } }
  sheet.mergeCells(1, 1, 1, cols)

  // Row 2: Subtitle
  const subRow = sheet.addRow([`Reporte de Fidelizacion — ${tenantName}`])
  subRow.font = FONT_TITLE
  sheet.mergeCells(2, 1, 2, cols)

  // Row 3: Date
  const dateRow = sheet.addRow([dateStr])
  dateRow.font = { ...FONT_BASE, color: { argb: MUTED_TEXT } }
  sheet.mergeCells(3, 1, 3, cols)

  // Row 4: Spacer
  sheet.addRow([])
}

function addTableHeaders(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers)
  row.height = 22
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = FONT_HEADER
    cell.border = BORDER_THIN
    cell.alignment = { horizontal: "center", vertical: "middle" }
  })
}

function styleTableRows(sheet: ExcelJS.Worksheet, dataStartRow: number, numCols: number) {
  for (let i = dataStartRow; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    const isAlt = (i - dataStartRow) % 2 === 1
    for (let c = 1; c <= numCols; c++) {
      const cell = row.getCell(c)
      cell.font = FONT_BASE
      cell.border = BORDER_THIN
      if (isAlt) cell.fill = ALT_ROW_FILL
      // Numbers right-aligned
      if (typeof cell.value === "number") {
        cell.alignment = { horizontal: "right" }
      }
    }
  }
}

function addTotalRow(sheet: ExcelJS.Worksheet, values: (string | number)[], numCols: number) {
  const row = sheet.addRow(values)
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c)
    cell.fill = TOTAL_FILL
    cell.font = { ...FONT_BASE, bold: true }
    cell.border = BORDER_THIN
    if (typeof cell.value === "number") cell.alignment = { horizontal: "right" }
  }
}

function addSectionTitle(sheet: ExcelJS.Worksheet, title: string, cols: number) {
  sheet.addRow([])
  const row = sheet.addRow([title])
  row.font = FONT_SECTION
  sheet.mergeCells(row.number, 1, row.number, cols)
}

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let maxLen = 10
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length
      if (len > maxLen) maxLen = len
    })
    col.width = Math.min(maxLen + 4, 40)
  })
}

function freezeFirstRows(sheet: ExcelJS.Worksheet, row: number) {
  sheet.views = [{ state: "frozen", ySplit: row, xSplit: 0 }]
}

// ─── Semaforo Helpers ─────────────────────────────────────────────────

function semaforo(value: number, green: number, yellow: number): { label: string; color: string } {
  if (value >= green) return { label: "Bien", color: GREEN }
  if (value >= yellow) return { label: "Atencion", color: YELLOW }
  return { label: "Critico", color: RED }
}

// ─── Main Generator ──────────────────────────────────────────────────

export async function generateReport(tenantName: string, data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik Office — Data Agent"
  wb.created = new Date()

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 1: Resumen
  // ═══════════════════════════════════════════════════════════════════
  const resumen = wb.addWorksheet("Resumen")
  addSheetHeader(resumen, tenantName, 6)

  // KPI cards (row 5-6)
  const kpis = [
    { value: data.summary.totalClients, label: "Clientes" },
    { value: data.summary.activeClients, label: "Activos" },
    { value: data.summary.totalVisits, label: "Visitas" },
    { value: data.summary.rewardsRedeemed, label: "Premios" },
    { value: data.summary.avgVisitsPerClient, label: "Prom. Visitas" },
  ]

  const kpiRow1 = resumen.addRow(kpis.map((k) => k.value))
  kpiRow1.height = 35
  kpiRow1.eachCell((cell) => {
    cell.font = FONT_KPI_VALUE
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = BORDER_THIN
  })

  const kpiRow2 = resumen.addRow(kpis.map((k) => k.label))
  kpiRow2.eachCell((cell) => {
    cell.font = FONT_KPI_LABEL
    cell.alignment = { horizontal: "center" }
    cell.border = BORDER_THIN
  })

  // Semaforo
  addSectionTitle(resumen, "Semaforo de Indicadores", 6)
  addTableHeaders(resumen, ["Indicador", "Valor", "Estado"])

  const visitChange =
    data.weekly.lastWeek.visits > 0
      ? ((data.weekly.thisWeek.visits - data.weekly.lastWeek.visits) /
          data.weekly.lastWeek.visits) *
        100
      : 0
  const indicators = [
    {
      name: "Visitas esta semana",
      value: data.weekly.thisWeek.visits,
      ...semaforo(data.weekly.thisWeek.visits, 20, 10),
    },
    {
      name: "Clientes nuevos",
      value: data.weekly.thisWeek.newClients,
      ...semaforo(data.weekly.thisWeek.newClients, 5, 2),
    },
    {
      name: "Cambio vs sem. anterior",
      value: `${Math.round(visitChange)}%`,
      ...semaforo(visitChange, 0, -10),
    },
    {
      name: "Prom. visitas/cliente",
      value: data.summary.avgVisitsPerClient,
      ...semaforo(data.summary.avgVisitsPerClient, 3, 1.5),
    },
  ]

  const semaforoStart = resumen.rowCount + 1
  for (const ind of indicators) {
    const row = resumen.addRow([ind.name, ind.value, ind.label])
    row.getCell(3).font = { ...FONT_BASE, bold: true, color: { argb: ind.color } }
    row.getCell(3).fill = fillColor(
      ind.color === GREEN ? LIGHT_GREEN : ind.color === RED ? LIGHT_RED : "FFFFFBEB",
    )
  }
  styleTableRows(resumen, semaforoStart, 3)

  // Comparacion semanal
  addSectionTitle(resumen, "Comparacion Semanal", 6)
  addTableHeaders(resumen, ["Periodo", "Visitas", "Clientes Nuevos"])
  const weekStart = resumen.rowCount + 1
  resumen.addRow(["Esta semana", data.weekly.thisWeek.visits, data.weekly.thisWeek.newClients])
  resumen.addRow(["Semana anterior", data.weekly.lastWeek.visits, data.weekly.lastWeek.newClients])
  styleTableRows(resumen, weekStart, 3)

  // Visitas por dia
  addSectionTitle(resumen, "Visitas por Dia de la Semana", 6)
  addTableHeaders(resumen, ["Dia", "Visitas"])
  const dayStart = resumen.rowCount + 1
  const totalDayVisits = data.byDayOfWeek.reduce((s, d) => s + d.visits, 0)
  for (const d of data.byDayOfWeek) {
    resumen.addRow([d.day, d.visits])
  }
  addTotalRow(resumen, ["Total", totalDayVisits], 2)
  styleTableRows(resumen, dayStart, 2)

  autoWidth(resumen)
  freezeFirstRows(resumen, 4)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 2: Top Clientes
  // ═══════════════════════════════════════════════════════════════════
  const topSheet = wb.addWorksheet("Top Clientes")
  addSheetHeader(topSheet, tenantName, 5)
  addTableHeaders(topSheet, ["Nombre", "Email", "Visitas", "Puntos", "Registro"])

  const topStart = topSheet.rowCount + 1
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
  styleTableRows(topSheet, topStart, 5)
  autoWidth(topSheet)
  freezeFirstRows(topSheet, 5)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 3: Visitas Recientes
  // ═══════════════════════════════════════════════════════════════════
  const visitasSheet = wb.addWorksheet("Visitas Recientes")
  addSheetHeader(visitasSheet, tenantName, 5)
  addTableHeaders(visitasSheet, ["Fecha", "Cliente", "# Visita", "Puntos", "Fuente"])

  const visitStart = visitasSheet.rowCount + 1
  for (const v of data.recentVisits) {
    visitasSheet.addRow([
      new Date(v.createdAt).toLocaleDateString("es-MX"),
      v.clientName,
      v.visitNum,
      v.points ?? 0,
      v.source,
    ])
  }
  styleTableRows(visitasSheet, visitStart, 5)
  autoWidth(visitasSheet)
  freezeFirstRows(visitasSheet, 5)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 4: Por Local
  // ═══════════════════════════════════════════════════════════════════
  const localSheet = wb.addWorksheet("Por Local")
  addSheetHeader(localSheet, tenantName, 4)
  addTableHeaders(localSheet, ["Local", "Visitas", "% del Total", ""])

  const totalLocVisits = data.byLocation.reduce((s, l) => s + l.visits, 0)
  const locStart = localSheet.rowCount + 1
  for (const l of data.byLocation) {
    const pct = totalLocVisits > 0 ? (l.visits / totalLocVisits) * 100 : 0
    const row = localSheet.addRow([l.locationName, l.visits, `${pct.toFixed(1)}%`, ""])
    // Visual bar in column 4
    const barCell = row.getCell(4)
    barCell.value = ""
    if (pct > 0) {
      barCell.fill = fillColor(CUIK_BLUE)
      barCell.note = `${pct.toFixed(1)}%`
    }
  }
  addTotalRow(localSheet, ["Total", totalLocVisits, "100%", ""], 4)
  styleTableRows(localSheet, locStart, 3) // don't restyle bar column
  // Set bar column width proportional
  localSheet.getColumn(4).width = 20
  autoWidth(localSheet)
  localSheet.getColumn(4).width = 20
  freezeFirstRows(localSheet, 5)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 5: Segmentacion
  // ═══════════════════════════════════════════════════════════════════
  const segSheet = wb.addWorksheet("Segmentacion")
  addSheetHeader(segSheet, tenantName, 4)

  const segColors: Record<string, string> = {
    "6+ visitas": GREEN,
    "4-5 visitas": YELLOW,
    "2-3 visitas": "FFF97316",
    "1 visita": RED,
  }

  addTableHeaders(segSheet, ["Segmento", "Clientes", "% del Total", ""])
  const totalSegClients = data.segmentation.reduce((s, seg) => s + seg.count, 0)
  const segStart = segSheet.rowCount + 1
  for (const s of data.segmentation) {
    const pct = totalSegClients > 0 ? (s.count / totalSegClients) * 100 : 0
    const row = segSheet.addRow([s.segment, s.count, `${pct.toFixed(1)}%`, ""])
    // Color indicator
    const colorArgb = segColors[s.segment] ?? MUTED_TEXT
    row.getCell(1).font = { ...FONT_BASE, bold: true, color: { argb: colorArgb } }
    if (pct > 0) {
      row.getCell(4).fill = fillColor(colorArgb)
    }
  }
  addTotalRow(segSheet, ["Total", totalSegClients, "100%", ""], 4)
  styleTableRows(segSheet, segStart, 3)
  segSheet.getColumn(4).width = 20

  // Inactive clients
  addSectionTitle(segSheet, "Clientes Inactivos (30+ dias)", 4)
  addTableHeaders(segSheet, ["Nombre", "Dias sin visita", "Visitas totales", ""])
  const inactStart = segSheet.rowCount + 1
  for (const c of data.inactiveClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    const row = segSheet.addRow([name, c.daysSinceLastVisit, c.totalVisits, ""])
    // Red highlight for very inactive
    if (c.daysSinceLastVisit > 60) {
      row.getCell(2).font = { ...FONT_BASE, color: { argb: RED } }
      row.getCell(2).fill = fillColor(LIGHT_RED)
    }
  }
  styleTableRows(segSheet, inactStart, 3)
  autoWidth(segSheet)
  segSheet.getColumn(4).width = 20
  freezeFirstRows(segSheet, 5)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 6: Retencion
  // ═══════════════════════════════════════════════════════════════════
  const retSheet = wb.addWorksheet("Retencion")
  addSheetHeader(retSheet, tenantName, 4)

  addTableHeaders(retSheet, ["Mes", "Registrados", "Retornaron", "Retencion %"])
  const retStart = retSheet.rowCount + 1
  for (const r of data.retentionByMonth) {
    const row = retSheet.addRow([r.month, r.registered, r.visited, r.retentionPct / 100])
    row.getCell(4).numFmt = "0.0%"
    // Color retention
    const retColor = r.retentionPct >= 50 ? GREEN : r.retentionPct >= 25 ? YELLOW : RED
    row.getCell(4).font = { ...FONT_BASE, bold: true, color: { argb: retColor } }
  }
  styleTableRows(retSheet, retStart, 4)

  // Wallet adoption
  addSectionTitle(retSheet, "Adopcion de Wallet", 4)
  addTableHeaders(retSheet, ["Canal", "Cantidad", "% del Total", ""])
  const walletStart = retSheet.rowCount + 1
  const wTotal = data.walletAdoption.totalClients || 1
  const walletRows = [
    { name: "Apple Wallet", value: data.walletAdoption.apple, color: DARK_TEXT },
    { name: "Google Wallet", value: data.walletAdoption.google, color: GREEN },
    { name: "Sin wallet", value: data.walletAdoption.none, color: MUTED_TEXT },
  ]
  for (const w of walletRows) {
    const pct = (w.value / wTotal) * 100
    retSheet.addRow([w.name, w.value, `${pct.toFixed(1)}%`, ""])
  }
  addTotalRow(retSheet, ["Total", data.walletAdoption.totalClients, "100%", ""], 4)
  styleTableRows(retSheet, walletStart, 3)

  // Avg time between visits
  addSectionTitle(retSheet, "Tiempo Promedio entre Visitas", 4)
  addTableHeaders(retSheet, ["Segmento", "Dias promedio"])
  const avgStart = retSheet.rowCount + 1
  for (const s of data.avgTimeBetweenVisits) {
    const row = retSheet.addRow([s.segment, s.avgDays])
    // Green if low, red if high
    const avgColor = s.avgDays <= 7 ? GREEN : s.avgDays <= 14 ? YELLOW : RED
    row.getCell(2).font = { ...FONT_BASE, color: { argb: avgColor } }
  }
  styleTableRows(retSheet, avgStart, 2)
  autoWidth(retSheet)
  freezeFirstRows(retSheet, 5)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 7: Tendencias
  // ═══════════════════════════════════════════════════════════════════
  const trendSheet = wb.addWorksheet("Tendencias")
  addSheetHeader(trendSheet, tenantName, 3)

  addTableHeaders(trendSheet, ["Semana", "Local", "Visitas"])
  const trendStart = trendSheet.rowCount + 1
  for (const r of data.visitsByLocationByWeek) {
    trendSheet.addRow([r.week, r.locationName, r.visits])
  }
  styleTableRows(trendSheet, trendStart, 3)

  addSectionTitle(trendSheet, "Clientes Nuevos por Semana", 3)
  addTableHeaders(trendSheet, ["Semana", "Nuevos", ""])
  const newStart = trendSheet.rowCount + 1
  let prevCount = 0
  for (const w of data.newClientsByWeek) {
    const row = trendSheet.addRow([w.week, w.count, ""])
    // Growth indicator
    if (prevCount > 0) {
      const change = w.count - prevCount
      const changeCell = row.getCell(3)
      changeCell.value = change >= 0 ? `+${change}` : `${change}`
      changeCell.font = {
        ...FONT_BASE,
        color: { argb: change >= 0 ? GREEN : RED },
        bold: true,
      }
    }
    prevCount = w.count
  }
  styleTableRows(trendSheet, newStart, 2) // don't restyle change column
  autoWidth(trendSheet)
  freezeFirstRows(trendSheet, 5)

  // ═══════════════════════════════════════════════════════════════════
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
