import ExcelJS from "exceljs"
import {
  appleDevices,
  clients,
  db,
  desc,
  eq,
  isNotNull,
  locations,
  passInstances,
  promotions,
  tenants,
  visits,
  sql,
} from "@cuik/db"
import { requireAuth, requireRole } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

function formatDate(d: Date | null | undefined): string {
  if (!d) return ""
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

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
    // Check if this tenant has minimumPurchaseAmount configured in any promotion
    const promoRows = await db
      .select({ config: promotions.config })
      .from(promotions)
      .where(eq(promotions.tenantId, tenant.id))

    const showAmount = promoRows.some((p) => {
      const cfg = p.config as Record<string, unknown> | null
      const acc = cfg?.accumulation as Record<string, unknown> | undefined
      const min = acc?.minimumPurchaseAmount as number | null | undefined
      return min != null && min > 0
    })

    const sheetName = tenant.name.replace(/[*?:/\\[\]]/g, "").slice(0, 31) || "Sin nombre"
    const ws = wb.addWorksheet(sheetName)

    // Build columns — Monto is conditional
    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Nombre", key: "name", width: 22 },
      { header: "Email", key: "email", width: 28 },
      { header: "Teléfono", key: "phone", width: 16 },
      { header: "DNI", key: "dni", width: 14 },
      { header: "Fecha Registro", key: "createdAt", width: 16 },
      { header: "Fecha Visita", key: "visitDate", width: 16 },
      { header: "Local", key: "location", width: 22 },
{ header: "Plataforma Wallet", key: "walletPlatform", width: 18 },
    ]
    if (showAmount) {
      cols.push({ header: "Monto", key: "amount", width: 12 })
    }
    ws.columns = cols

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

    // Query clients with their visits (LEFT JOIN so 0-visit clients appear)
    const rows = await db
      .select({
        clientName: clients.name,
        clientLastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        dni: clients.dni,
        clientCreatedAt: clients.createdAt,
        clientId: clients.id,
        visitCreatedAt: visits.createdAt,
        visitLocationId: visits.locationId,
        visitAmount: visits.amount,
      })
      .from(clients)
      .leftJoin(visits, eq(visits.clientId, clients.id))
      .where(eq(clients.tenantId, tenant.id))
      .orderBy(clients.lastName, clients.name, desc(visits.createdAt))

    // Pre-fetch all locations for this tenant
    const tenantLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.tenantId, tenant.id))
    const locationMap = new Map(tenantLocations.map((l) => [l.id, l.name]))

    // Pre-fetch wallet platform per client using a single query
    // Apple: join passInstances → appleDevices on serialNumber
    // Google: passInstances.googleObjectId IS NOT NULL
    const passRows = await db
      .selectDistinctOn([passInstances.clientId], {
        clientId: passInstances.clientId,
        hasApple: sql<boolean>`EXISTS (
          SELECT 1 FROM passes.apple_devices ad
          WHERE ad.serial_number = ${passInstances.serialNumber}
        )`,
        hasGoogle: sql<boolean>`${passInstances.googleObjectId} IS NOT NULL`,
      })
      .from(passInstances)
      .innerJoin(clients, eq(clients.id, passInstances.clientId))
      .where(eq(clients.tenantId, tenant.id))

    const walletMap = new Map<string, string>()
    for (const p of passRows) {
      if (p.hasApple) walletMap.set(p.clientId, "Apple Wallet")
      else if (p.hasGoogle) walletMap.set(p.clientId, "Google Wallet")
      else walletMap.set(p.clientId, "Sin Wallet")
    }

    for (const row of rows) {
      const fullName = [row.clientName, row.clientLastName].filter(Boolean).join(" ")
      const walletPlatform = walletMap.get(row.clientId) ?? "Sin Wallet"

      const rowData: Record<string, unknown> = {
        name: fullName,
        email: row.email ?? "",
        phone: row.phone ?? "",
        dni: row.dni ?? "",
        createdAt: formatDate(row.clientCreatedAt),
        visitDate: row.visitCreatedAt ? formatDate(row.visitCreatedAt) : "Sin visitas",
        location: row.visitLocationId ? (locationMap.get(row.visitLocationId) ?? "") : "",
        walletPlatform,
      }
      if (showAmount) {
        rowData.amount = row.visitAmount != null ? Number(row.visitAmount) : ""
      }
      ws.addRow(rowData)
    }

    // Auto-filter
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
    }
  }

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
