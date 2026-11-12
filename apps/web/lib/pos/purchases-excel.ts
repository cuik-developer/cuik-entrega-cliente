import { db, sql } from "@cuik/db"
import ExcelJS from "exceljs"

import { categoryLabel, type PurchaseAnalytics, type PurchaseFilters } from "./purchases"

/**
 * "Exportar compras": the purchases of the period as the merchant (or Cuik)
 * analyses them outside the panel. Sheets: Líneas (one per SKU sold, with
 * the Cuik client when the sale is linked), Ventas (one per ticket),
 * Clientes (one per Cuik client with purchases), Categorías, Marcas, Resumen.
 */

/** Lines are the big sheet: beyond this the period must be narrowed. */
export const MAX_EXPORT_LINES = 80_000

const LINK_LABEL: Record<string, string> = {
  dni: "DNI",
  inferred_amount: "Inferido (monto)",
  inferred_time: "Inferido (hora)",
  manual: "A mano",
}

type LineRow = {
  sold_on: string
  sold_at_local: string | null
  store: string | null
  cashier: string | null
  order_ref: string | null
  link_kind: string | null
  client_name: string | null
  client_dni: string | null
  client_phone: string | null
  client_email: string | null
  till_dni: string | null
  till_name: string | null
  sku: string | null
  product_name: string | null
  odoo_category: string | null
  category_key: string | null
  brand: string | null
  pack_size: string | null
  qty: string
  unit_price: string
  discount_pct: string
  total: string
}

type SaleRow = {
  sold_on: string
  store: string | null
  cashier: string | null
  order_ref: string | null
  amount: string
  link_kind: string | null
  client_name: string | null
  client_dni: string | null
  lines: string
}

type ClientRow = {
  name: string
  dni: string | null
  phone: string | null
  email: string | null
  tickets: string
  amount: string
  first_on: string
  last_on: string
  top_key: string | null
  top_brand: string | null
}

export async function buildPurchasesExcel(input: {
  tenantId: string
  tenantName: string
  timezone: string
  filters: PurchaseFilters
  analytics: PurchaseAnalytics
}): Promise<{ buffer: Buffer; lines: number; truncated: boolean }> {
  const { tenantId, filters: f, analytics: a, timezone } = input
  const where = sql`s.tenant_id = ${tenantId} and s.source = 'pos' and s.amount > 0
    and s.sold_on between ${f.from}::date and ${f.to}::date
    ${f.store ? sql`and s.store = ${f.store}` : sql``}
    ${f.cuikOnly ? sql`and s.client_id is not null` : sql``}`

  const [lines, sales, clients] = await Promise.all([
    db.execute<LineRow>(sql`
      select s.sold_on,
             to_char(s.sold_at at time zone 'UTC' at time zone ${timezone}, 'DD/MM/YYYY HH24:MI') as sold_at_local,
             s.store, s.cashier, s.order_ref, s.link_kind,
             case when c.id is null then null else trim(c.name || ' ' || coalesce(c.last_name, '')) end as client_name,
             c.dni as client_dni, c.phone as client_phone, c.email as client_email,
             s.dni as till_dni, s.customer_name as till_name,
             l.sku, l.product_name, l.odoo_category, l.category_key, l.brand, p.pack_size,
             l.qty, l.unit_price, l.discount_pct, l.total
      from analytics.sale_lines l
      join analytics.sales s on s.id = l.sale_id
      left join loyalty.clients c on c.id = s.client_id
      left join analytics.products p on p.tenant_id = l.tenant_id and p.sku = l.sku
      where ${where}
      order by s.sold_at desc, s.order_ref, l.pos_line_id
      limit ${MAX_EXPORT_LINES + 1}`),
    db.execute<SaleRow>(sql`
      select s.sold_on, s.store, s.cashier, s.order_ref, s.amount, s.link_kind,
             case when c.id is null then null else trim(c.name || ' ' || coalesce(c.last_name, '')) end as client_name,
             c.dni as client_dni,
             (select count(*) from analytics.sale_lines l where l.sale_id = s.id) as lines
      from analytics.sales s left join loyalty.clients c on c.id = s.client_id
      where ${where} order by s.sold_at`),
    db.execute<ClientRow>(sql`
      with per as (
        select s.client_id, count(*) as tickets, sum(s.amount) as amount, min(s.sold_on) as first_on, max(s.sold_on) as last_on
        from analytics.sales s where ${where} and s.client_id is not null group by s.client_id
      ), topc as (
        select distinct on (s.client_id) s.client_id, l.category_key
        from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
        where ${where} and s.client_id is not null and l.category_key is not null
        group by s.client_id, l.category_key order by s.client_id, sum(l.total) desc
      ), topb as (
        select distinct on (s.client_id) s.client_id, l.brand
        from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
        where ${where} and s.client_id is not null and l.brand is not null
        group by s.client_id, l.brand order by s.client_id, sum(l.total) desc
      )
      select trim(c.name || ' ' || coalesce(c.last_name, '')) as name, c.dni, c.phone, c.email,
             per.tickets, per.amount, per.first_on, per.last_on, topc.category_key as top_key, topb.brand as top_brand
      from per join loyalty.clients c on c.id = per.client_id
      left join topc on topc.client_id = per.client_id
      left join topb on topb.client_id = per.client_id
      order by per.amount desc`),
  ])
  // Newest first from the database (the cap keeps the recent ones); oldest first in the sheet.
  const truncated = lines.rows.length > MAX_EXPORT_LINES
  const lineRows = (truncated ? lines.rows.slice(0, MAX_EXPORT_LINES) : lines.rows).reverse()

  const wb = new ExcelJS.Workbook()
  wb.creator = "Cuik"
  const cat = (k: string | null) => (k ? categoryLabel(k) : "")
  const species = (k: string | null) =>
    k ? (k.split(":")[0] === "perro" ? "Perro" : k.split(":")[0] === "gato" ? "Gato" : "") : ""

  const ws = wb.addWorksheet("Líneas", { views: [{ state: "frozen", ySplit: 1 }] })
  ws.columns = [
    { header: "Fecha y hora", key: "when", width: 18 },
    { header: "Tienda", key: "store", width: 18 },
    { header: "Cajero", key: "cashier", width: 16 },
    { header: "Referencia", key: "ref", width: 24 },
    { header: "Cliente Cuik", key: "client", width: 28 },
    { header: "DNI", key: "dni", width: 11 },
    { header: "Celular", key: "phone", width: 12 },
    { header: "Correo", key: "email", width: 26 },
    { header: "Enlace", key: "link", width: 14 },
    { header: "Doc. en venta", key: "tillDni", width: 12 },
    { header: "Nombre en venta", key: "tillName", width: 24 },
    { header: "SKU", key: "sku", width: 12 },
    { header: "Producto", key: "product", width: 40 },
    { header: "Categoría Odoo", key: "odoo", width: 32 },
    { header: "Especie", key: "species", width: 9 },
    { header: "Categoría Cuik", key: "cat", width: 24 },
    { header: "Marca", key: "brand", width: 16 },
    { header: "Presentación", key: "pack", width: 12 },
    { header: "Cantidad", key: "qty", width: 9 },
    { header: "Precio", key: "price", width: 10 },
    { header: "Dto. %", key: "disc", width: 8 },
    { header: "Total", key: "total", width: 11 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const l of lineRows) {
    ws.addRow({
      when: l.sold_at_local ?? l.sold_on,
      store: l.store ?? "",
      cashier: l.cashier ?? "",
      ref: l.order_ref ?? "",
      client: l.client_name ?? "",
      dni: l.client_dni ?? "",
      phone: l.client_phone ?? "",
      email: l.client_email ?? "",
      link: l.link_kind ? (LINK_LABEL[l.link_kind] ?? l.link_kind) : l.client_name ? "DNI" : "",
      tillDni: l.till_dni ?? "",
      tillName: l.till_name ?? "",
      sku: l.sku ?? "",
      product: l.product_name ?? "",
      odoo: l.odoo_category ?? "",
      species: species(l.category_key),
      cat: cat(l.category_key),
      brand: l.brand ?? "",
      pack: l.pack_size ?? "",
      qty: Number(l.qty),
      price: Number(l.unit_price),
      disc: Number(l.discount_pct),
      total: Number(l.total),
    })
  }
  for (const k of ["price", "total"]) ws.getColumn(k).numFmt = "#,##0.00"

  const wsS = wb.addWorksheet("Ventas", { views: [{ state: "frozen", ySplit: 1 }] })
  wsS.columns = [
    { header: "Fecha", key: "day", width: 12 },
    { header: "Tienda", key: "store", width: 18 },
    { header: "Cajero", key: "cashier", width: 16 },
    { header: "Referencia", key: "ref", width: 24 },
    { header: "Cliente Cuik", key: "client", width: 28 },
    { header: "DNI", key: "dni", width: 11 },
    { header: "Enlace", key: "link", width: 14 },
    { header: "Líneas", key: "lines", width: 8 },
    { header: "Monto", key: "amount", width: 11 },
  ]
  wsS.getRow(1).font = { bold: true }
  for (const s of sales.rows) {
    wsS.addRow({
      day: s.sold_on,
      store: s.store ?? "",
      cashier: s.cashier ?? "",
      ref: s.order_ref ?? "",
      client: s.client_name ?? "",
      dni: s.client_dni ?? "",
      link: s.link_kind ? (LINK_LABEL[s.link_kind] ?? s.link_kind) : s.client_name ? "DNI" : "",
      lines: Number(s.lines),
      amount: Number(s.amount),
    })
  }
  wsS.getColumn("amount").numFmt = "#,##0.00"

  const wsC = wb.addWorksheet("Clientes", { views: [{ state: "frozen", ySplit: 1 }] })
  wsC.columns = [
    { header: "Cliente", key: "name", width: 28 },
    { header: "DNI", key: "dni", width: 11 },
    { header: "Celular", key: "phone", width: 12 },
    { header: "Correo", key: "email", width: 26 },
    { header: "Tickets", key: "tickets", width: 8 },
    { header: "Gasto", key: "amount", width: 11 },
    { header: "Ticket promedio", key: "avg", width: 13 },
    { header: "Primera compra", key: "first", width: 13 },
    { header: "Última compra", key: "last", width: 13 },
    { header: "Categoría principal", key: "cat", width: 24 },
    { header: "Marca principal", key: "brand", width: 16 },
  ]
  wsC.getRow(1).font = { bold: true }
  for (const c of clients.rows) {
    const tickets = Number(c.tickets)
    const amount = Number(c.amount)
    wsC.addRow({
      name: c.name,
      dni: c.dni ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      tickets,
      amount,
      avg: tickets > 0 ? Math.round((amount / tickets) * 100) / 100 : null,
      first: c.first_on,
      last: c.last_on,
      cat: cat(c.top_key),
      brand: c.top_brand ?? "",
    })
  }
  for (const k of ["amount", "avg"]) wsC.getColumn(k).numFmt = "#,##0.00"

  const wsCat = wb.addWorksheet("Categorías")
  wsCat.columns = [
    { header: "Categoría", key: "label", width: 28 },
    { header: "Ventas S/", key: "amount", width: 12 },
    { header: "% del total", key: "share", width: 10 },
    { header: "Tickets", key: "tickets", width: 8 },
    { header: "Ticket promedio", key: "avg", width: 13 },
    { header: "Unidades", key: "qty", width: 9 },
    { header: "Clientes Cuik", key: "clients", width: 12 },
    { header: "Compradores sin tarjeta", key: "noCard", width: 20 },
    { header: "Frecuencia (días)", key: "freq", width: 15 },
  ]
  wsCat.getRow(1).font = { bold: true }
  for (const c of a.categories) {
    wsCat.addRow({
      label: c.label,
      amount: c.amount,
      share: c.share,
      tickets: c.tickets,
      avg: c.avgTicket,
      qty: c.qty,
      clients: c.clients,
      noCard: c.buyersNoCard,
      freq: c.frequencyDays,
    })
  }

  const wsB = wb.addWorksheet("Marcas")
  wsB.columns = [
    { header: "Marca", key: "brand", width: 20 },
    { header: "Ventas S/", key: "amount", width: 12 },
    { header: "% del total", key: "share", width: 10 },
    { header: "Tickets", key: "tickets", width: 8 },
    { header: "Clientes Cuik", key: "clients", width: 12 },
    { header: "Frecuencia (días)", key: "freq", width: 15 },
    { header: "Categoría principal", key: "top", width: 28 },
    { header: "% en esa categoría", key: "topShare", width: 16 },
  ]
  wsB.getRow(1).font = { bold: true }
  for (const b of a.brands) {
    wsB.addRow({
      brand: b.brand,
      amount: b.amount,
      share: b.share,
      tickets: b.tickets,
      clients: b.clients,
      freq: b.frequencyDays,
      top: b.topCategory ?? "",
      topShare: b.topCategoryShare,
    })
  }

  const wsR = wb.addWorksheet("Resumen")
  wsR.columns = [
    { header: "Concepto", key: "k", width: 40 },
    { header: "Valor", key: "v", width: 20 },
  ]
  wsR.getRow(1).font = { bold: true }
  const t = a.totals
  const rows: [string, string | number][] = [
    ["Comercio", input.tenantName],
    ["Periodo", `${f.from} a ${f.to}`],
    ["Tienda", f.store ?? "Todas"],
    ["Ventas", f.cuikOnly ? "Solo clientes Cuik" : "Todas"],
    ["Tickets", t.sales],
    ["Ventas S/", t.amount],
    ["Ticket promedio", t.avgTicket ?? ""],
    ["Clientes Cuik que compraron", t.clients],
    ["% de la venta de clientes Cuik", t.cuikAmountShare ?? ""],
    ["Compradores con documento sin tarjeta", t.buyersNoCard],
    ["Ventas de invitado", t.guestSales],
    ["Líneas sin clasificar", a.unclassified.lines],
    ["Líneas exportadas", lineRows.length],
  ]
  if (truncated)
    rows.push(["Aviso", `La hoja Líneas se cortó en ${MAX_EXPORT_LINES} filas: acorta el periodo.`])
  for (const [k, v] of rows) wsR.addRow({ k, v })

  const buf = await wb.xlsx.writeBuffer()
  return { buffer: Buffer.from(buf as ArrayBuffer), lines: lineRows.length, truncated }
}
