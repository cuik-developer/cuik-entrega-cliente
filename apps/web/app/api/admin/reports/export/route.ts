import {
  and,
  clients,
  db,
  desc,
  eq,
  locations,
  passInstances,
  promotions,
  sql,
  tenants,
  visits,
} from "@cuik/db"
import ExcelJS from "exceljs"
import { requireAuth, requireRole } from "@/lib/api-utils"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const dynamic = "force-dynamic"

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ""
  // db.execute() hands raw timestamps back as strings; the query builder as Dates.
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ""
  // Render in Lima timezone — a visit at 23:30 Lima is stored as UTC 04:30
  // of the NEXT day, and without an explicit timeZone the server's OS tz
  // bleeds through and shifts the date by a day.
  return dt.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Lima",
  })
}

export async function GET(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError

  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  // Optional date range (YYYY-MM-DD in America/Lima). Filters visits only;
  // clients are always included (0-visit clients still get one row).
  const url = new URL(request.url)
  const fromParam = url.searchParams.get("from")
  const toParam = url.searchParams.get("to")
  const fromDate = fromParam && ISO_DATE_RE.test(fromParam) ? fromParam : null
  const toDate = toParam && ISO_DATE_RE.test(toParam) ? toParam : null
  const PLATFORM_TZ = "America/Lima"

  const activeTenants = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.name)

  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  wb.created = new Date()

  // ── Sheet 1: Resumen (platform KPIs + activity) ─────────────────
  const styleHeader = (ws: ExcelJS.Worksheet, cols: number) => {
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E70DB" } }
    headerRow.alignment = { vertical: "middle", horizontal: "center" }
    headerRow.height = 28
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } }
  }
  const summaryRes = await db.execute<Record<string, number | string | null>>(sql`
    SELECT
      (SELECT count(*)::int FROM tenants) AS tenants_total,
      (SELECT count(*)::int FROM tenants WHERE status = 'active') AS tenants_active,
      (SELECT count(*)::int FROM tenants WHERE status = 'trial') AS tenants_trial,
      (SELECT count(*)::int FROM loyalty.clients) AS clients_total,
      (SELECT count(*)::int FROM loyalty.clients WHERE created_at >= now() - interval '30 days') AS clients_new_30d,
      (SELECT count(*)::int FROM loyalty.visits WHERE source <> 'bonus') AS visits_total,
      (SELECT count(*)::int FROM loyalty.visits WHERE source <> 'bonus' AND created_at >= now() - interval '30 days') AS visits_30d,
      (SELECT count(DISTINCT tenant_id)::int FROM loyalty.visits WHERE source <> 'bonus' AND created_at >= now() - interval '7 days') AS active_tenants_7d,
      (SELECT count(DISTINCT tenant_id)::int FROM loyalty.visits WHERE source <> 'bonus' AND created_at >= now() - interval '30 days') AS active_tenants_30d,
      (SELECT count(*)::int FROM passes.apple_devices WHERE created_at >= now() - interval '30 days') AS apple_installs_30d,
      ((SELECT count(*)::int FROM loyalty.rewards WHERE status = 'redeemed' AND redeemed_at >= now() - interval '30 days')
       + (SELECT count(*)::int FROM loyalty.points_transactions WHERE type = 'redeem' AND created_at >= now() - interval '30 days')) AS redemptions_30d
  `)
  const sm = summaryRes.rows[0] ?? {}
  const wsSummary = wb.addWorksheet("Resumen")
  wsSummary.columns = [
    { header: "Indicador", key: "k", width: 44 },
    { header: "Valor", key: "v", width: 16 },
  ]
  styleHeader(wsSummary, 2)
  const summaryRows: Array<[string, unknown]> = [
    ["Fecha de exportacion (Lima)", formatDate(new Date())],
    ["Comercios (total)", sm.tenants_total],
    ["Comercios activos", sm.tenants_active],
    ["Comercios en demo", sm.tenants_trial],
    ["Comercios con visitas en 7 dias", sm.active_tenants_7d],
    ["Comercios con visitas en 30 dias", sm.active_tenants_30d],
    ["Clientes (total)", sm.clients_total],
    ["Clientes nuevos (30 dias)", sm.clients_new_30d],
    ["Visitas (total, sin bonos)", sm.visits_total],
    ["Visitas (30 dias)", sm.visits_30d],
    ["Pases Apple instalados (30 dias)", sm.apple_installs_30d],
    ["Canjes (30 dias, sellos + puntos)", sm.redemptions_30d],
  ]
  for (const [k, v] of summaryRows) wsSummary.addRow({ k, v: v == null ? "" : Number(v) || v })

  // ── Sheet 2: Comercios (one row per tenant with KPIs) ───────────
  const tenantsRes = await db.execute<{
    name: string
    slug: string
    status: string
    plan: string | null
    program: string | null
    created_at: Date | string
    trial_ends_at: Date | string | null
    clients: number
    clients_new_30d: number
    visits_total: number
    visits_30d: number
    last_visit_at: Date | string | null
    installed: number
    redemptions_30d: number
    apple_mode: string | null
  }>(sql`
    SELECT t.name, t.slug, t.status, p.name AS plan, t.created_at, t.trial_ends_at,
      (SELECT pr.type FROM loyalty.promotions pr WHERE pr.tenant_id = t.id AND pr.active = true ORDER BY pr.created_at DESC LIMIT 1) AS program,
      (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id) AS clients,
      (SELECT count(*)::int FROM loyalty.clients c WHERE c.tenant_id = t.id AND c.created_at >= now() - interval '30 days') AS clients_new_30d,
      (SELECT count(*)::int FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus') AS visits_total,
      (SELECT count(*)::int FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus' AND v.created_at >= now() - interval '30 days') AS visits_30d,
      (SELECT max(v.created_at) FROM loyalty.visits v WHERE v.tenant_id = t.id AND v.source <> 'bonus') AS last_visit_at,
      (SELECT count(DISTINCT pi.client_id)::int FROM passes.pass_instances pi
         LEFT JOIN passes.apple_devices ad ON ad.serial_number = pi.serial_number
         JOIN loyalty.clients c ON c.id = pi.client_id
        WHERE c.tenant_id = t.id AND (ad.serial_number IS NOT NULL OR (pi.google_save_url IS NOT NULL AND pi.google_save_url <> ''))) AS installed,
      ((SELECT count(*)::int FROM loyalty.rewards r WHERE r.tenant_id = t.id AND r.status = 'redeemed' AND r.redeemed_at >= now() - interval '30 days')
       + (SELECT count(*)::int FROM loyalty.points_transactions pt WHERE pt.tenant_id = t.id AND pt.type = 'redeem' AND pt.created_at >= now() - interval '30 days')) AS redemptions_30d,
      t.apple_config->>'mode' AS apple_mode
    FROM tenants t
    LEFT JOIN plans p ON p.id = t.plan_id
    ORDER BY t.name
  `)
  const wsTenants = wb.addWorksheet("Comercios")
  wsTenants.columns = [
    { header: "Comercio", key: "name", width: 26 },
    { header: "Slug", key: "slug", width: 18 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Plan", key: "plan", width: 14 },
    { header: "Programa", key: "program", width: 11 },
    { header: "Alta", key: "createdAt", width: 12 },
    { header: "Demo vence", key: "trialEndsAt", width: 12 },
    { header: "Clientes", key: "clients", width: 10 },
    { header: "Nuevos 30d", key: "clientsNew30d", width: 11 },
    { header: "Visitas", key: "visitsTotal", width: 10 },
    { header: "Visitas 30d", key: "visits30d", width: 11 },
    { header: "Ultima visita", key: "lastVisitAt", width: 13 },
    { header: "Pases instalados", key: "installed", width: 15 },
    { header: "Canjes 30d", key: "redemptions30d", width: 11 },
    { header: "Apple", key: "appleMode", width: 13 },
  ]
  styleHeader(wsTenants, 15)
  const STATUS_ES: Record<string, string> = {
    pending: "Pendiente",
    trial: "Demo",
    active: "Activo",
    expired: "Vencido",
    cancelled: "Cancelado",
    paused: "Pausado",
  }
  for (const t of tenantsRes.rows) {
    wsTenants.addRow({
      name: t.name,
      slug: t.slug,
      status: STATUS_ES[t.status] ?? t.status,
      plan: t.plan ?? "",
      program: t.program === "points" ? "Puntos" : t.program === "stamps" ? "Sellos" : "",
      createdAt: formatDate(t.created_at),
      trialEndsAt: t.trial_ends_at ? formatDate(t.trial_ends_at) : "",
      clients: Number(t.clients),
      clientsNew30d: Number(t.clients_new_30d),
      visitsTotal: Number(t.visits_total),
      visits30d: Number(t.visits_30d),
      lastVisitAt: t.last_visit_at ? formatDate(t.last_visit_at) : "Sin visitas",
      installed: Number(t.installed),
      redemptions30d: Number(t.redemptions_30d),
      appleMode:
        t.apple_mode === "production"
          ? "Produccion"
          : t.apple_mode === "configuring"
            ? "Configurando"
            : "Demo",
    })
  }

  for (const tenant of activeTenants) {
    // Determine program type + minimum-purchase setting from the tenant's
    // ACTIVE promotion. Only one row should match; if multiple exist, prefer
    // the most recently created (defensive).
    const activePromoRows = await db
      .select({ type: promotions.type, config: promotions.config })
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenant.id), eq(promotions.active, true)))
      .orderBy(desc(promotions.createdAt))
      .limit(1)

    const activePromo = activePromoRows[0]
    const programType: "stamps" | "points" | null =
      activePromo?.type === "stamps" || activePromo?.type === "points" ? activePromo.type : null

    // Min purchase amount — path differs by program type
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

    const sheetName = tenant.name.replace(/[*?:/\\[\]]/g, "").slice(0, 31) || "Sin nombre"
    const ws = wb.addWorksheet(sheetName)

    // Build columns in spec order:
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

    // Query clients with their visits (LEFT JOIN so 0-visit clients appear).
    // When a date range is passed, only visits within it join; clients with
    // zero visits in range still get a "Sin visitas" row.
    const visitJoinConditions = [eq(visits.clientId, clients.id)]
    if (fromDate) {
      visitJoinConditions.push(
        sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TZ})::date >= ${fromDate}::date`,
      )
    }
    if (toDate) {
      visitJoinConditions.push(
        sql`(${visits.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TZ})::date <= ${toDate}::date`,
      )
    }

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
        visitNum: visits.visitNum,
        visitCycle: visits.cycleNumber,
        visitPoints: visits.points,
      })
      .from(clients)
      .leftJoin(visits, and(...visitJoinConditions))
      .where(eq(clients.tenantId, tenant.id))
      .orderBy(clients.lastName, clients.name, desc(visits.createdAt))

    // Pre-fetch all locations for this tenant
    const tenantLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.tenantId, tenant.id))
    const locationMap = new Map(tenantLocations.map((l) => [l.id, l.name]))

    // Pre-fetch wallet platform per client — canonical detection logic:
    // - Apple: pass_instances.apple_pass_url IS NOT NULL AND != ''
    // - Google: pass_instances.google_save_url IS NOT NULL AND != ''
    // - Sin Wallet: neither. Priority: Apple > Google.
    // Aggregate with BOOL_OR in case a client has multiple pass_instances.
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

    for (const row of rows) {
      const fullName = [row.clientName, row.clientLastName].filter(Boolean).join(" ")
      const walletPlatform = walletMap.get(row.clientId) ?? "Sin Wallet"
      const hasVisit = row.visitCreatedAt != null

      const rowData: Record<string, unknown> = {
        name: fullName,
        email: row.email ?? "",
        phone: row.phone ?? "",
        dni: row.dni ?? "",
        createdAt: formatDate(row.clientCreatedAt),
        visitDate: hasVisit ? formatDate(row.visitCreatedAt) : "Sin visitas",
        location: row.visitLocationId ? (locationMap.get(row.visitLocationId) ?? "") : "",
        walletPlatform,
      }
      if (programType === "stamps") {
        rowData.stampNum = hasVisit ? (row.visitNum ?? "") : ""
        rowData.cycle = hasVisit ? (row.visitCycle ?? "") : ""
      } else if (programType === "points") {
        rowData.points = hasVisit ? (row.visitPoints ?? 0) : ""
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
