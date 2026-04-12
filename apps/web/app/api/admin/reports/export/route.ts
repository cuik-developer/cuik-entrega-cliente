import ExcelJS from "exceljs"
import { clients, db, desc, eq, locations, passInstances, tenants, visits } from "@cuik/db"
import { requireAuth, requireRole } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const activeTenants = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.name)

  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  wb.created = new Date()

  for (const tenant of activeTenants) {
    const sheetName = tenant.name.replace(/[*?:/\\[\]]/g, "").slice(0, 31) || "Sin nombre"
    const ws = wb.addWorksheet(sheetName)

    ws.columns = [
      { header: "Nombre", key: "name", width: 22 },
      { header: "Email", key: "email", width: 28 },
      { header: "Teléfono", key: "phone", width: 16 },
      { header: "Fecha Registro", key: "createdAt", width: 18 },
      { header: "Total Visitas", key: "totalVisits", width: 14 },
      { header: "Última Visita", key: "lastVisit", width: 18 },
      { header: "Puntos", key: "points", width: 10 },
      { header: "Local de Última Visita", key: "lastLocation", width: 24 },
      { header: "Plataforma Wallet", key: "walletPlatform", width: 18 },
    ]

    // Style header row
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0E70DB" },
    }
    headerRow.alignment = { vertical: "middle", horizontal: "center" }
    headerRow.height = 28

    // Query all clients for this tenant
    const tenantClients = await db
      .select({
        name: clients.name,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        createdAt: clients.createdAt,
        totalVisits: clients.totalVisits,
        pointsBalance: clients.pointsBalance,
        clientId: clients.id,
      })
      .from(clients)
      .where(eq(clients.tenantId, tenant.id))
      .orderBy(clients.name)

    for (const client of tenantClients) {
      // Get last visit with location
      const lastVisitRows = await db
        .select({
          createdAt: visits.createdAt,
          locationId: visits.locationId,
        })
        .from(visits)
        .where(eq(visits.clientId, client.clientId))
        .orderBy(desc(visits.createdAt))
        .limit(1)

      const lastVisit = lastVisitRows[0]

      // Get location name if available
      let locationName = ""
      if (lastVisit?.locationId) {
        const locRows = await db
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, lastVisit.locationId))
          .limit(1)
        locationName = locRows[0]?.name ?? ""
      }

      // Determine wallet platform from pass instances
      const passRows = await db
        .select({
          applePassUrl: passInstances.applePassUrl,
          googleSaveUrl: passInstances.googleSaveUrl,
        })
        .from(passInstances)
        .where(eq(passInstances.clientId, client.clientId))
        .limit(1)

      let walletPlatform = "Sin pase"
      if (passRows[0]) {
        const hasApple = !!passRows[0].applePassUrl
        const hasGoogle = !!passRows[0].googleSaveUrl
        if (hasApple && hasGoogle) walletPlatform = "Apple + Google"
        else if (hasApple) walletPlatform = "Apple Wallet"
        else if (hasGoogle) walletPlatform = "Google Wallet"
        else walletPlatform = "Pendiente"
      }

      const fullName = [client.name, client.lastName].filter(Boolean).join(" ")

      ws.addRow({
        name: fullName,
        email: client.email ?? "",
        phone: client.phone ?? "",
        createdAt: client.createdAt
          ? client.createdAt.toLocaleDateString("es-MX", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
          : "",
        totalVisits: client.totalVisits ?? 0,
        lastVisit: lastVisit?.createdAt
          ? lastVisit.createdAt.toLocaleDateString("es-MX", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
          : "Sin visitas",
        points: client.pointsBalance ?? 0,
        lastLocation: locationName,
        walletPlatform,
      })
    }

    // Auto-filter on header row
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 9 },
    }
  }

  // If no tenants, add an empty sheet
  if (activeTenants.length === 0) {
    wb.addWorksheet("Sin tenants activos")
  }

  const buffer = await wb.xlsx.writeBuffer()

  const date = new Date().toISOString().slice(0, 10)
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cuik-datos-${date}.xlsx"`,
    },
  })
}
