import {
  and,
  clients,
  db,
  desc,
  eq,
  gte,
  locations,
  passInstances,
  promotions,
  sql,
  visits,
} from "@cuik/db"
import ExcelJS from "exceljs"

import { requireAuth, requireRole, requireTenantMembership, resolveTenant } from "@/lib/api-utils"

function formatDateOnly(d: Date | null | undefined, tz: string): string {
  if (!d) return ""
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  })
}

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

    // Determine program type + minimum-purchase setting from the tenant's
    // active promotion. Mirrors the super-admin export logic so columns
    // stay consistent between both reports.
    const activePromoRows = await db
      .select({ type: promotions.type, config: promotions.config })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .orderBy(desc(promotions.createdAt))
      .limit(1)

    const activePromo = activePromoRows[0]
    const programType: "stamps" | "points" | null =
      activePromo?.type === "stamps" || activePromo?.type === "points" ? activePromo.type : null

    let showAmount = false
    if (activePromo?.config) {
      const cfg = activePromo.config as Record<string, unknown>
      if (programType === "stamps") {
        const acc = cfg.accumulation as Record<string, unknown> | undefined
        const min = acc?.minimumPurchaseAmount as number | null | undefined
        showAmount = min != null && min > 0
      } else if (programType === "points") {
        const pts = cfg.points as Record<string, unknown> | undefined
        const min = pts?.minimumPurchaseForPoints as number | null | undefined
        showAmount = min != null && min > 0
      }
    }

    // Wallet platform per client — same canonical logic as super-admin export
    const passRows = await db
      .select({
        clientId: passInstances.clientId,
        hasApple: sql<boolean>`BOOL_OR(${passInstances.applePassUrl} IS NOT NULL AND ${passInstances.applePassUrl} <> '')`,
        hasGoogle: sql<boolean>`BOOL_OR(${passInstances.googleSaveUrl} IS NOT NULL AND ${passInstances.googleSaveUrl} <> '')`,
      })
      .from(passInstances)
      .innerJoin(clients, eq(clients.id, passInstances.clientId))
      .where(eq(clients.tenantId, tenant.id))
      .groupBy(passInstances.clientId)

    const walletMap = new Map<string, string>()
    for (const p of passRows) {
      if (p.hasApple) walletMap.set(p.clientId, "Apple Wallet")
      else if (p.hasGoogle) walletMap.set(p.clientId, "Google Wallet")
      else walletMap.set(p.clientId, "Sin Wallet")
    }

    // One row per visit (INNER JOIN — we only export visits within range)
    const rows = await db
      .select({
        visitDate: visits.createdAt,
        visitNum: visits.visitNum,
        visitCycle: visits.cycleNumber,
        visitPoints: visits.points,
        visitAmount: visits.amount,
        clientId: clients.id,
        clientName: clients.name,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
        clientDni: clients.dni,
        clientCreatedAt: clients.createdAt,
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

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Visitas")

    // Column order (same as super-admin export):
    // Nombre | Email | Teléfono | DNI | [# Sellos | Ciclo] or [Puntos] |
    // Fecha Registro | Fecha Visita | Local | Plataforma Wallet | [Monto]
    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Nombre", key: "name", width: 22 },
      { header: "Email", key: "email", width: 28 },
      { header: "Teléfono", key: "phone", width: 16 },
      { header: "DNI", key: "dni", width: 14 },
    ]
    if (programType === "stamps") {
      cols.push({ header: "# Sellos", key: "stampNum", width: 10 })
      cols.push({ header: "Ciclo", key: "cycle", width: 8 })
    } else if (programType === "points") {
      cols.push({ header: "Puntos", key: "points", width: 10 })
    }
    cols.push(
      { header: "Fecha Registro", key: "createdAt", width: 16 },
      { header: "Fecha Visita", key: "visitDate", width: 16 },
      { header: "Local", key: "location", width: 22 },
      { header: "Plataforma Wallet", key: "walletPlatform", width: 18 },
    )
    if (showAmount) {
      cols.push({ header: "Monto", key: "amount", width: 12 })
    }
    sheet.columns = cols

    // Style header row — same treatment as super-admin export
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0E70DB" },
    }
    headerRow.alignment = { vertical: "middle", horizontal: "center" }
    headerRow.height = 28

    const tz = tenant.timezone ?? "America/Lima"

    for (const r of rows) {
      const fullName = [r.clientName, r.clientLastName].filter(Boolean).join(" ")
      const walletPlatform = walletMap.get(r.clientId) ?? "Sin Wallet"

      const rowData: Record<string, unknown> = {
        name: fullName,
        email: r.clientEmail ?? "",
        phone: r.clientPhone ?? "",
        dni: r.clientDni ?? "",
        createdAt: r.clientCreatedAt ? formatDateOnly(r.clientCreatedAt, tz) : "",
        visitDate: r.visitDate ? formatDateOnly(r.visitDate, tz) : "",
        location: r.locationName ?? "",
        walletPlatform,
      }
      if (programType === "stamps") {
        rowData.stampNum = r.visitNum ?? ""
        rowData.cycle = r.visitCycle ?? ""
      } else if (programType === "points") {
        rowData.points = r.visitPoints ?? 0
      }
      if (showAmount) {
        rowData.amount = r.visitAmount != null ? Number(r.visitAmount) : ""
      }
      sheet.addRow(rowData)
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
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
