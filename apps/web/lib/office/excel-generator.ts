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
const FONT_NARRATIVE: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  color: { argb: DARK_TEXT },
  italic: true,
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

function addSheetTitle(sheet: ExcelJS.Worksheet, title: string, cols: number) {
  const row = sheet.addRow([title])
  row.font = FONT_TITLE
  row.height = 24
  sheet.mergeCells(row.number, 1, row.number, cols)
}

function addNarrativeRow(sheet: ExcelJS.Worksheet, text: string, cols: number) {
  const row = sheet.addRow([text])
  row.font = FONT_NARRATIVE
  row.alignment = { wrapText: true, vertical: "top" }
  row.height = 60
  sheet.mergeCells(row.number, 1, row.number, cols)
}

function addSpacerRow(sheet: ExcelJS.Worksheet) {
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

function freezeAfterRow(sheet: ExcelJS.Worksheet, row: number) {
  sheet.views = [{ state: "frozen", ySplit: row, xSplit: 0 }]
}

// ─── Semaforo Helpers ─────────────────────────────────────────────────

function semaforo(value: number, green: number, yellow: number): { label: string; color: string } {
  if (value >= green) return { label: "Bien", color: GREEN }
  if (value >= yellow) return { label: "Atencion", color: YELLOW }
  return { label: "Critico", color: RED }
}

// ─── AI Narrative Parser ─────────────────────────────────────────────

function extractNarrativeSection(
  aiNarrative: string | undefined,
  sectionNames: string[],
): string {
  if (!aiNarrative) return ""
  const lines = aiNarrative.split("\n")
  let capturing = false
  const captured: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#{1,3}\s+/.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,3}\s+/, "").toLowerCase()
      if (sectionNames.some((s) => heading.includes(s.toLowerCase()))) {
        capturing = true
        continue
      }
      if (capturing) break
    }
    if (capturing) captured.push(line)
  }

  return captured.join("\n").trim()
}

function extractSheetNarrative(
  aiNarrative: string | undefined,
  sectionNames: string[],
): string {
  const text = extractNarrativeSection(aiNarrative, sectionNames)
  return text || ""
}

// ─── Main Generator ──────────────────────────────────────────────────

export async function generateReport(
  tenantName: string,
  data: ReportData,
  aiNarrative?: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik Office — Data Agent"
  wb.created = new Date()

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 1: Dashboard Ejecutivo
  // ═══════════════════════════════════════════════════════════════════
  const dash = wb.addWorksheet("Dashboard Ejecutivo")
  const dashCols = 6

  addSheetTitle(dash, `Dashboard Ejecutivo — ${tenantName}`, dashCols)
  const dashNarr = extractSheetNarrative(aiNarrative, [
    "dashboard",
    "resumen ejecutivo",
    "resumen general",
    "executive summary",
  ])
  addNarrativeRow(dash, dashNarr || `Reporte generado el ${new Date().toLocaleDateString("es-MX")}`, dashCols)
  addSpacerRow(dash)

  // KPI cards
  const retentionRate =
    data.retentionByMonth.length > 0
      ? data.retentionByMonth[data.retentionByMonth.length - 1]!.retentionPct
      : 0
  const redemptionRate =
    data.summary.totalVisits > 0
      ? Math.round((data.summary.rewardsRedeemed / data.summary.totalVisits) * 100)
      : 0

  const kpis = [
    { value: data.summary.totalClients, label: "Clientes" },
    { value: data.summary.totalVisits, label: "Visitas" },
    { value: data.summary.avgVisitsPerClient, label: "Frecuencia" },
    { value: `${redemptionRate}%`, label: "Tasa Canje" },
    { value: `${retentionRate}%`, label: "Retencion" },
  ]

  const kpiRow1 = dash.addRow(kpis.map((k) => k.value))
  kpiRow1.height = 35
  kpiRow1.eachCell((cell) => {
    cell.font = FONT_KPI_VALUE
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = BORDER_THIN
  })

  const kpiRow2 = dash.addRow(kpis.map((k) => k.label))
  kpiRow2.eachCell((cell) => {
    cell.font = FONT_KPI_LABEL
    cell.alignment = { horizontal: "center" }
    cell.border = BORDER_THIN
  })

  // Semaforo
  addSectionTitle(dash, "Semaforo de Indicadores", dashCols)
  addTableHeaders(dash, ["Indicador", "Valor", "Estado"])

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

  const semaforoStart = dash.rowCount + 1
  for (const ind of indicators) {
    const row = dash.addRow([ind.name, ind.value, ind.label])
    row.getCell(3).font = { ...FONT_BASE, bold: true, color: { argb: ind.color } }
    row.getCell(3).fill = fillColor(
      ind.color === GREEN ? LIGHT_GREEN : ind.color === RED ? LIGHT_RED : "FFFFFBEB",
    )
  }
  styleTableRows(dash, semaforoStart, 3)

  // Comparacion semanal
  addSectionTitle(dash, "Comparacion Semanal", dashCols)
  addTableHeaders(dash, ["Periodo", "Visitas", "Clientes Nuevos"])
  const weekStart = dash.rowCount + 1
  dash.addRow(["Esta semana", data.weekly.thisWeek.visits, data.weekly.thisWeek.newClients])
  dash.addRow(["Semana anterior", data.weekly.lastWeek.visits, data.weekly.lastWeek.newClients])
  styleTableRows(dash, weekStart, 3)

  autoWidth(dash)
  freezeAfterRow(dash, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 2: Patrones Temporales
  // ═══════════════════════════════════════════════════════════════════
  const pat = wb.addWorksheet("Patrones Temporales")
  const patCols = 3

  addSheetTitle(pat, "Patrones Temporales", patCols)
  const patNarr = extractSheetNarrative(aiNarrative, [
    "patrones temporales",
    "patrones",
    "temporal",
    "dia de la semana",
  ])
  addNarrativeRow(pat, patNarr || "Distribucion de visitas por dia de la semana y por semana.", patCols)
  addSpacerRow(pat)

  // Visitas por dia
  addTableHeaders(pat, ["Dia", "Visitas", "% del Total"])
  const totalDayVisits = data.byDayOfWeek.reduce((s, d) => s + d.visits, 0)
  const dayStart = pat.rowCount + 1
  for (const d of data.byDayOfWeek) {
    const pct = totalDayVisits > 0 ? ((d.visits / totalDayVisits) * 100).toFixed(1) : "0.0"
    pat.addRow([d.day, d.visits, `${pct}%`])
  }
  addTotalRow(pat, ["Total", totalDayVisits, "100%"], 3)
  styleTableRows(pat, dayStart, 3)

  // Nuevos clientes por semana
  addSectionTitle(pat, "Clientes Nuevos por Semana", patCols)
  addTableHeaders(pat, ["Semana", "Nuevos", "Cambio"])
  const newStart = pat.rowCount + 1
  let prevCount = 0
  for (const w of data.newClientsByWeek) {
    const row = pat.addRow([w.week, w.count, ""])
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
  styleTableRows(pat, newStart, 2)

  autoWidth(pat)
  freezeAfterRow(pat, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 3: Segmentacion Clientes
  // ═══════════════════════════════════════════════════════════════════
  const seg = wb.addWorksheet("Segmentacion Clientes")
  const segCols = 4

  addSheetTitle(seg, "Segmentacion Clientes — Piramide de Lealtad", segCols)
  const segNarr = extractSheetNarrative(aiNarrative, [
    "segmentacion",
    "piramide",
    "lealtad",
    "segmentos",
  ])
  addNarrativeRow(seg, segNarr || "Distribucion de clientes por frecuencia de visitas.", segCols)
  addSpacerRow(seg)

  const segColors: Record<string, string> = {
    "6+ visitas": GREEN,
    "4-5 visitas": YELLOW,
    "2-3 visitas": "FFF97316",
    "1 visita": RED,
    "0 visitas": MUTED_TEXT,
  }

  addTableHeaders(seg, ["Segmento", "Clientes", "% del Total", ""])
  const totalSegClients = data.segmentation.reduce((s, item) => s + item.count, 0)
  const segStart = seg.rowCount + 1
  for (const s of data.segmentation) {
    const pct = totalSegClients > 0 ? (s.count / totalSegClients) * 100 : 0
    const row = seg.addRow([s.segment, s.count, `${pct.toFixed(1)}%`, ""])
    const colorArgb = segColors[s.segment] ?? MUTED_TEXT
    row.getCell(1).font = { ...FONT_BASE, bold: true, color: { argb: colorArgb } }
    if (pct > 0) {
      row.getCell(4).fill = fillColor(colorArgb)
    }
  }
  addTotalRow(seg, ["Total", totalSegClients, "100%", ""], 4)
  styleTableRows(seg, segStart, 3)
  seg.getColumn(4).width = 20

  // Inactive clients
  addSectionTitle(seg, "Clientes Inactivos (30+ dias)", segCols)
  addTableHeaders(seg, ["Nombre", "Dias sin visita", "Visitas totales", ""])
  const inactStart = seg.rowCount + 1
  for (const c of data.inactiveClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    const row = seg.addRow([name, c.daysSinceLastVisit, c.totalVisits, ""])
    if (c.daysSinceLastVisit != null && c.daysSinceLastVisit > 60) {
      row.getCell(2).font = { ...FONT_BASE, color: { argb: RED } }
      row.getCell(2).fill = fillColor(LIGHT_RED)
    }
  }
  styleTableRows(seg, inactStart, 3)

  autoWidth(seg)
  seg.getColumn(4).width = 20
  freezeAfterRow(seg, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 4: Retencion
  // ═══════════════════════════════════════════════════════════════════
  const ret = wb.addWorksheet("Retencion")
  const retCols = 4

  addSheetTitle(ret, "Retencion — Cohortes Mensuales", retCols)
  const retNarr = extractSheetNarrative(aiNarrative, [
    "retencion",
    "retención",
    "cohorte",
    "cohort",
  ])
  addNarrativeRow(ret, retNarr || "Porcentaje de clientes que retornan despues de registrarse.", retCols)
  addSpacerRow(ret)

  addTableHeaders(ret, ["Mes", "Registrados", "Retornaron", "Retencion %"])
  const retStart = ret.rowCount + 1
  for (const r of data.retentionByMonth) {
    const row = ret.addRow([r.month, r.registered, r.visited, r.retentionPct / 100])
    row.getCell(4).numFmt = "0.0%"
    const retColor = r.retentionPct >= 50 ? GREEN : r.retentionPct >= 25 ? YELLOW : RED
    row.getCell(4).font = { ...FONT_BASE, bold: true, color: { argb: retColor } }
  }
  styleTableRows(ret, retStart, 4)

  // Avg time between visits
  addSectionTitle(ret, "Tiempo Promedio entre Visitas", retCols)
  addTableHeaders(ret, ["Segmento", "Dias promedio"])
  const avgStart = ret.rowCount + 1
  for (const s of data.avgTimeBetweenVisits) {
    const row = ret.addRow([s.segment, s.avgDays])
    const avgColor = s.avgDays <= 7 ? GREEN : s.avgDays <= 14 ? YELLOW : RED
    row.getCell(2).font = { ...FONT_BASE, color: { argb: avgColor } }
  }
  styleTableRows(ret, avgStart, 2)

  autoWidth(ret)
  freezeAfterRow(ret, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 5: Performance por Local
  // ═══════════════════════════════════════════════════════════════════
  const loc = wb.addWorksheet("Performance por Local")
  const locCols = 4

  addSheetTitle(loc, "Performance por Local", locCols)
  const locNarr = extractSheetNarrative(aiNarrative, [
    "por local",
    "performance",
    "locales",
    "sucursal",
  ])
  addNarrativeRow(loc, locNarr || "Visitas por local y tendencia semanal.", locCols)
  addSpacerRow(loc)

  // By location
  addTableHeaders(loc, ["Local", "Visitas", "% del Total", ""])
  const totalLocVisits = data.byLocation.reduce((s, l) => s + l.visits, 0)
  const locStart = loc.rowCount + 1
  for (const l of data.byLocation) {
    const pct = totalLocVisits > 0 ? (l.visits / totalLocVisits) * 100 : 0
    const row = loc.addRow([l.locationName, l.visits, `${pct.toFixed(1)}%`, ""])
    if (pct > 0) {
      row.getCell(4).fill = fillColor(CUIK_BLUE)
      row.getCell(4).note = `${pct.toFixed(1)}%`
    }
  }
  addTotalRow(loc, ["Total", totalLocVisits, "100%", ""], 4)
  styleTableRows(loc, locStart, 3)
  loc.getColumn(4).width = 20

  // Weekly trend by location
  addSectionTitle(loc, "Tendencia Semanal por Local", locCols)
  addTableHeaders(loc, ["Semana", "Local", "Visitas"])
  const trendStart = loc.rowCount + 1
  for (const r of data.visitsByLocationByWeek) {
    loc.addRow([r.week, r.locationName, r.visits])
  }
  styleTableRows(loc, trendStart, 3)

  autoWidth(loc)
  loc.getColumn(4).width = 20
  freezeAfterRow(loc, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 6: Digital & Rewards
  // ═══════════════════════════════════════════════════════════════════
  const dig = wb.addWorksheet("Digital & Rewards")
  const digCols = 4

  addSheetTitle(dig, "Digital & Rewards", digCols)
  const digNarr = extractSheetNarrative(aiNarrative, [
    "digital",
    "wallet",
    "rewards",
    "premios",
    "adopcion",
  ])
  addNarrativeRow(dig, digNarr || "Adopcion de wallet digital y premios canjeados.", digCols)
  addSpacerRow(dig)

  // Wallet adoption
  addTableHeaders(dig, ["Canal", "Cantidad", "% del Total", ""])
  const wTotal = data.walletAdoption.totalClients || 1
  const walletRows = [
    { name: "Apple Wallet", value: data.walletAdoption.apple, color: DARK_TEXT },
    { name: "Google Wallet", value: data.walletAdoption.google, color: GREEN },
    { name: "Sin plataforma", value: data.walletAdoption.none, color: MUTED_TEXT },
  ]
  const walletStart = dig.rowCount + 1
  for (const w of walletRows) {
    const pct = (w.value / wTotal) * 100
    dig.addRow([w.name, w.value, `${pct.toFixed(1)}%`, ""])
  }
  addTotalRow(dig, ["Total", data.walletAdoption.totalClients, "100%", ""], 4)
  styleTableRows(dig, walletStart, 3)

  // Rewards summary
  addSectionTitle(dig, "Premios", digCols)
  addTableHeaders(dig, ["Indicador", "Valor"])
  const rewStart = dig.rowCount + 1
  dig.addRow(["Premios canjeados", data.summary.rewardsRedeemed])
  dig.addRow(["Tasa de canje", `${redemptionRate}%`])
  styleTableRows(dig, rewStart, 2)

  autoWidth(dig)
  freezeAfterRow(dig, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 7: Crecimiento
  // ═══════════════════════════════════════════════════════════════════
  const crec = wb.addWorksheet("Crecimiento")
  const crecCols = 5

  addSheetTitle(crec, "Crecimiento", crecCols)
  const crecNarr = extractSheetNarrative(aiNarrative, [
    "crecimiento",
    "growth",
    "nuevos clientes",
    "adquisicion",
  ])
  addNarrativeRow(crec, crecNarr || "Nuevos clientes por semana, top clientes y visitas recientes.", crecCols)
  addSpacerRow(crec)

  // New clients by week
  addTableHeaders(crec, ["Semana", "Nuevos"])
  const crecNewStart = crec.rowCount + 1
  for (const w of data.newClientsByWeek.slice(-12)) {
    crec.addRow([w.week, w.count])
  }
  styleTableRows(crec, crecNewStart, 2)

  // Top clients
  addSectionTitle(crec, "Top 10 Clientes (por visitas)", crecCols)
  addTableHeaders(crec, ["Nombre", "Email", "Visitas", "Puntos", "Registro"])
  const topStart = crec.rowCount + 1
  for (const c of data.topClients) {
    const name = [c.name, c.lastName].filter(Boolean).join(" ")
    crec.addRow([
      name,
      c.email ?? "",
      c.totalVisits,
      c.pointsBalance,
      new Date(c.createdAt).toLocaleDateString("es-MX"),
    ])
  }
  styleTableRows(crec, topStart, 5)

  // Recent visits
  addSectionTitle(crec, "Visitas Recientes (ultimos 14 dias)", crecCols)
  addTableHeaders(crec, ["Fecha", "Cliente", "# Visita", "Puntos", "Fuente"])
  const visitStart = crec.rowCount + 1
  for (const v of data.recentVisits) {
    crec.addRow([
      new Date(v.createdAt).toLocaleDateString("es-MX"),
      v.clientName,
      v.visitNum,
      v.points ?? 0,
      v.source,
    ])
  }
  styleTableRows(crec, visitStart, 5)

  autoWidth(crec)
  freezeAfterRow(crec, 3)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 8: Plan de Accion
  // ═══════════════════════════════════════════════════════════════════
  const plan = wb.addWorksheet("Plan de Accion")
  const planCols = 1

  addSheetTitle(plan, "Plan de Accion", planCols)

  const planText = extractNarrativeSection(aiNarrative, [
    "plan de accion",
    "plan de acción",
    "recomendaciones",
    "recommendations",
    "action plan",
  ])

  if (planText) {
    const planLines = planText.split("\n")
    for (const line of planLines) {
      if (line.trim() === "") {
        addSpacerRow(plan)
        continue
      }
      const row = plan.addRow([line])
      row.font = FONT_BASE
      row.alignment = { wrapText: true, vertical: "top" }
    }
  } else {
    addSpacerRow(plan)
    const row = plan.addRow(["Sin datos de analisis — ejecuta el agente Data para generar recomendaciones."])
    row.font = { ...FONT_BASE, color: { argb: MUTED_TEXT }, italic: true }
    row.alignment = { wrapText: true }
  }

  plan.getColumn(1).width = 80
  freezeAfterRow(plan, 1)

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 9: Anomalias
  // ═══════════════════════════════════════════════════════════════════
  const anom = wb.addWorksheet("Anomalias")
  const anomCols = 1

  addSheetTitle(anom, "Anomalias", anomCols)

  const anomText = extractNarrativeSection(aiNarrative, [
    "anomalias",
    "anomalías",
    "anomaly",
    "anomalies",
    "alertas",
    "alerts",
  ])

  if (anomText) {
    const anomLines = anomText.split("\n")
    for (const line of anomLines) {
      if (line.trim() === "") {
        addSpacerRow(anom)
        continue
      }
      const row = anom.addRow([line])
      row.font = FONT_BASE
      row.alignment = { wrapText: true, vertical: "top" }
    }
  } else {
    addSpacerRow(anom)
    const row = anom.addRow(["Sin anomalias detectadas — ejecuta el agente Data para analizar los datos."])
    row.font = { ...FONT_BASE, color: { argb: MUTED_TEXT }, italic: true }
    row.alignment = { wrapText: true }
  }

  anom.getColumn(1).width = 80
  freezeAfterRow(anom, 1)

  // ═══════════════════════════════════════════════════════════════════
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
