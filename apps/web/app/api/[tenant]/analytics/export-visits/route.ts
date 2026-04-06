import { and, clients, db, eq, gte, locations, sql, visits } from "@cuik/db"
import ExcelJS from "exceljs"

import { requireAuth, requireRole, requireTenantMembership, resolveTenant } from "@/lib/api-utils"
import { formatDateForExport } from "@/lib/format-date"

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), { status: 404 })
    }

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const url = new URL(request.url)
    const from = url.searchParams.get("from")
    const to = url.searchParams.get("to")

    if (!from || !to) {
      return new Response(JSON.stringify({ error: "from and to params required" }), { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    const rows = await db
      .select({
        visitDate: visits.createdAt,
        clientName: clients.name,
        clientLastName: clients.lastName,
        source: visits.source,
        visitNum: visits.visitNum,
        cycleNumber: visits.cycleNumber,
        amount: visits.amount,
        points: visits.points,
        locationName: locations.name,
      })
      .from(visits)
      .innerJoin(clients, eq(clients.id, visits.clientId))
      .leftJoin(locations, eq(locations.id, visits.locationId))
      .where(
        and(
          eq(visits.tenantId, tenant.id),
          gte(visits.createdAt, fromDate),
          sql`${visits.createdAt} <= ${toDate}`,
        ),
      )
      .orderBy(visits.createdAt)

    const sourceLabels: Record<string, string> = {
      qr: "QR",
      manual: "Manual",
      bonus: "Bonus",
    }

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Visitas")

    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 22 },
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Sede", key: "sede", width: 20 },
      { header: "Tipo", key: "tipo", width: 12 },
      { header: "Sello #", key: "sello", width: 10 },
      { header: "Ciclo", key: "ciclo", width: 10 },
      { header: "Monto", key: "monto", width: 12 },
      { header: "Puntos", key: "puntos", width: 10 },
    ]

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { horizontal: "center" }

    const tz = tenant.timezone ?? "America/Lima"

    for (const r of rows) {
      const date = r.visitDate ? formatDateForExport(r.visitDate, tz) : ""
      const clientName = r.clientName + (r.clientLastName ? ` ${r.clientLastName}` : "")
      const source = sourceLabels[r.source] ?? r.source

      sheet.addRow({
        fecha: date,
        cliente: clientName,
        sede: r.locationName ?? "",
        tipo: source,
        sello: r.visitNum,
        ciclo: r.cycleNumber,
        monto: r.amount ?? "",
        puntos: r.points ?? 0,
      })
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="visitas-${from}-a-${to}.xlsx"`,
      },
    })
  } catch (error) {
    console.error("[GET /api/[tenant]/analytics/export-visits]", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }
}
