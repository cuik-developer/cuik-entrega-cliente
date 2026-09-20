import ExcelJS from "exceljs"
import { z } from "zod"

import { computePlatformMetrics, type MetricsFilters } from "@/lib/admin/platform-metrics"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

const querySchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    status: z.enum(["all", "active", "trial"]).default("all"),
    program: z.enum(["all", "stamps", "points"]).default("all"),
    planId: z.string().uuid().optional(),
    tenantIds: z.string().optional(),
    includeInternal: z.enum(["0", "1"]).default("0"),
    format: z.enum(["json", "xlsx"]).default("json"),
  })
  .refine((q) => q.from <= q.to, { message: "from must be <= to", path: ["from"] })

/**
 * GET /api/admin/metrics — every block of the Métricas dashboard for the
 * given filters, compared with the previous period. `format=xlsx` downloads
 * the same numbers (Resumen, Comercios, Insights) as an Excel file.
 */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return errorResponse("Invalid query", 400, parsed.error.flatten())
    const q = parsed.data
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1
    if (days > 366) return errorResponse("El rango máximo es de un año", 400)

    const filters: MetricsFilters = {
      from: q.from,
      to: q.to,
      status: q.status,
      program: q.program,
      planId: q.planId ?? null,
      tenantIds: (q.tenantIds ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s)),
      includeInternal: q.includeInternal === "1",
    }
    const data = await computePlatformMetrics(filters)
    if (q.format === "json") return successResponse(data)

    // ── Excel with the same filters ──
    const wb = new ExcelJS.Workbook()
    wb.creator = "Cuik"
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
      { header: "Indicador", key: "k", width: 40 },
      { header: `Período (${data.range.from} a ${data.range.to})`, key: "cur", width: 26 },
      {
        header: `Anterior (${data.range.prevFrom} a ${data.range.prevTo})`,
        key: "prev",
        width: 26,
      },
    ]
    header(ws1, 3)
    const kp = data.kpis
    const rows: Array<[string, number | string, number | string]> = [
      ["Comercios en el filtro", kp.scopeTenants, ""],
      ["Comercios con visitas", kp.activeTenants.cur, kp.activeTenants.prev],
      ["Visitas (sin bonos)", kp.visits.cur, kp.visits.prev],
      ["Clientes nuevos", kp.newClients.cur, kp.newClients.prev],
      ["Tasa de retorno (% con 2+ visitas)", kp.returnRate.cur, kp.returnRate.prev],
      ["Instalación del pase (% de nuevos)", kp.installRate.cur, kp.installRate.prev],
      ["Ticket promedio (S/)", kp.avgTicket.cur, kp.avgTicket.prev],
      ["Canjes", kp.redemptions.cur, kp.redemptions.prev],
      ["Ingreso mensual estimado (S/)", kp.mrr.cur, kp.mrr.prev],
      ["Campañas enviadas", data.campaigns.sent, ""],
      [
        "Notificaciones entregadas / total",
        `${data.campaigns.delivered} / ${data.campaigns.notifications}`,
        "",
      ],
      [
        "Clientes con Apple / Google / sin pase",
        `${data.wallet.apple} / ${data.wallet.google} / ${data.wallet.none}`,
        "",
      ],
    ]
    for (const [k, cur, prev] of rows) ws1.addRow({ k, cur, prev })

    const ws2 = wb.addWorksheet("Comercios")
    ws2.columns = [
      { header: "Comercio", key: "name", width: 26 },
      { header: "Estado", key: "status", width: 10 },
      { header: "Plan", key: "plan", width: 12 },
      { header: "Programa", key: "program", width: 10 },
      { header: "Clientes", key: "clients", width: 10 },
      { header: "Nuevos", key: "newClients", width: 9 },
      { header: "Visitas", key: "visits", width: 9 },
      { header: "Visitas ant.", key: "visitsPrev", width: 11 },
      { header: "Retorno %", key: "returnRate", width: 10 },
      { header: "Pases instalados", key: "installed", width: 15 },
      { header: "Instalación nuevos %", key: "installRate", width: 18 },
      { header: "Canjes", key: "redemptions", width: 8 },
      { header: "Ticket prom.", key: "avgTicket", width: 12 },
      { header: "Última visita", key: "lastVisitAt", width: 13 },
      { header: "Demo (días)", key: "trialDaysLeft", width: 11 },
      { header: "Salud", key: "health", width: 9 },
    ]
    header(ws2, 16)
    const HEALTH = { good: "Activo", warn: "Enfriándose", bad: "Sin uso", none: "Sin clientes" }
    for (const t of data.tenants) {
      ws2.addRow({
        ...t,
        program: t.program === "points" ? "Puntos" : t.program === "stamps" ? "Sellos" : "",
        returnRate: t.returnRate ?? "",
        installRate: t.installRate ?? "",
        avgTicket: t.avgTicket ?? "",
        lastVisitAt: t.lastVisitAt ? t.lastVisitAt.slice(0, 10) : "Sin visitas",
        trialDaysLeft: t.trialDaysLeft ?? "",
        health: HEALTH[t.health],
      })
    }

    const ws3 = wb.addWorksheet("Insights")
    ws3.columns = [
      { header: "Nivel", key: "severity", width: 12 },
      { header: "Observación", key: "text", width: 110 },
    ]
    header(ws3, 2)
    for (const i of data.insights) ws3.addRow({ severity: i.severity, text: i.text })

    const buffer = await wb.xlsx.writeBuffer()
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cuik-metricas-${q.from}-a-${q.to}.xlsx"`,
      },
    })
  } catch (error) {
    console.error("[GET /api/admin/metrics]", error)
    return errorResponse("Internal server error", 500)
  }
}
