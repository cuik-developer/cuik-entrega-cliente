import { db, eq, sql, tenants } from "@cuik/db"

import { leafOfKey, speciesOfKey } from "@/lib/growth/categories"
import { addDays } from "@/lib/growth/dates"
import { CONNECTOR_SOURCES_SQL } from "./sources"

/**
 * Análisis de compras: what the point of sale sells by category, brand and
 * SKU, and how the Cuik clients buy it. Everything is SQL over
 * analytics.sales / sale_lines for the period; the classification comes from
 * sale_lines.category_key / brand (the product master first). The till's
 * orders and the sales orders of Odoo Ventas (e-commerce, phone) both count:
 * they are the merchant's sales, and a client's repurchase may go either way.
 */

export type PurchaseFilters = {
  /** Tenant-local days, inclusive. */
  from: string
  to: string
  /** POS store name; null = every store. */
  store: string | null
  /** Only sales linked to a Cuik client. */
  cuikOnly: boolean
}

export type CategoryRow = {
  key: string
  species: string | null
  leaf: string
  label: string
  amount: number
  share: number
  tickets: number
  avgTicket: number | null
  qty: number
  /** Distinct Cuik clients who bought it. */
  clients: number
  /** Distinct documents at the till with no Cuik client. */
  buyersNoCard: number
  /** Median days between two purchases of the same client in this category (12 months). */
  frequencyDays: number | null
  frequencySample: number
}

export type BrandRow = {
  brand: string
  amount: number
  share: number
  tickets: number
  clients: number
  frequencyDays: number | null
  topCategory: string | null
  topCategoryShare: number | null
}

export type ProductRow = {
  sku: string | null
  name: string | null
  categoryKey: string | null
  brand: string | null
  amount: number
  tickets: number
  qty: number
  clients: number
  frequencyDays: number | null
}

export type PurchaseAnalytics = {
  filters: PurchaseFilters
  stores: string[]
  hasData: boolean
  totals: {
    sales: number
    amount: number
    avgTicket: number | null
    clients: number
    buyersNoCard: number
    guestSales: number
    cuikAmountShare: number | null
    cuikSalesShare: number | null
    lines: number
  }
  categories: CategoryRow[]
  brands: BrandRow[]
  products: ProductRow[]
  trend: { month: string; total: number; byCategory: Record<string, number> }[]
  trendKeys: string[]
  unclassified: { lines: number; amount: number }
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const r2 = (n: number) => Math.round(n * 100) / 100

export function categoryLabel(key: string): string {
  const sp = speciesOfKey(key)
  const leaf = leafOfKey(key).replace(/_/g, " ")
  return sp ? `${sp === "perro" ? "Perro" : "Gato"} · ${leaf}` : leaf || "sin categoría"
}

export async function purchaseStores(tenantId: string): Promise<string[]> {
  const rows = await db.execute<{ store: string }>(sql`
    select distinct store from analytics.sales
    where tenant_id = ${tenantId} and source in ${CONNECTOR_SOURCES_SQL} and store is not null
    order by store`)
  return rows.rows.map((r) => r.store)
}

export async function purchaseAnalytics(
  tenantId: string,
  f: PurchaseFilters,
): Promise<PurchaseAnalytics> {
  const where = sql`s.tenant_id = ${tenantId} and s.source in ${CONNECTOR_SOURCES_SQL} and s.amount > 0
    and s.sold_on between ${f.from}::date and ${f.to}::date
    ${f.store ? sql`and s.store = ${f.store}` : sql``}
    ${f.cuikOnly ? sql`and s.client_id is not null` : sql``}`
  const freqFrom = addDays(f.to, -365)
  const whereFreq = sql`s.tenant_id = ${tenantId} and s.source in ${CONNECTOR_SOURCES_SQL} and s.amount > 0
    and s.client_id is not null and s.sold_on between ${freqFrom}::date and ${f.to}::date
    ${f.store ? sql`and s.store = ${f.store}` : sql``}`

  const [
    stores,
    totals,
    categories,
    brands,
    products,
    trend,
    unclassified,
    catFreq,
    brandFreq,
    skuFreq,
  ] = await Promise.all([
    purchaseStores(tenantId),
    db.execute<{
      sales: string
      amount: string
      clients: string
      buyers_no_card: string
      guest_sales: string
      cuik_amount: string
      cuik_sales: string
      lines: string
    }>(sql`
        select count(*) as sales, coalesce(sum(s.amount), 0) as amount,
               count(distinct s.client_id) as clients,
               count(distinct s.dni) filter (where s.client_id is null) as buyers_no_card,
               count(*) filter (where s.dni is null and s.client_id is null) as guest_sales,
               coalesce(sum(s.amount) filter (where s.client_id is not null), 0) as cuik_amount,
               count(*) filter (where s.client_id is not null) as cuik_sales,
               coalesce(sum((select count(*) from analytics.sale_lines l where l.sale_id = s.id)), 0) as lines
        from analytics.sales s where ${where}`),
    db.execute<{
      key: string
      amount: string
      tickets: string
      qty: string
      clients: string
      buyers_no_card: string
    }>(sql`
        select l.category_key as key, coalesce(sum(l.total), 0) as amount,
               count(distinct l.sale_id) as tickets, coalesce(sum(l.qty), 0) as qty,
               count(distinct s.client_id) as clients,
               count(distinct s.dni) filter (where s.client_id is null) as buyers_no_card
        from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
        where ${where} and l.category_key is not null
        group by l.category_key order by amount desc`),
    db.execute<{
      brand: string
      amount: string
      tickets: string
      clients: string
      top_key: string | null
      top_amount: string | null
    }>(sql`
        with b as (
          select l.brand, l.category_key, sum(l.total) as amount, count(distinct l.sale_id) as tickets,
                 count(distinct s.client_id) as clients
          from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
          where ${where} and l.brand is not null
          group by l.brand, l.category_key
        ), t as (
          select brand, sum(amount) as amount from b group by brand
        ), top as (
          select distinct on (brand) brand, category_key, amount from b
          where category_key is not null order by brand, amount desc
        ), c as (
          select l.brand, count(distinct l.sale_id) as tickets, count(distinct s.client_id) as clients
          from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
          where ${where} and l.brand is not null group by l.brand
        )
        select t.brand, t.amount, c.tickets, c.clients, top.category_key as top_key, top.amount as top_amount
        from t join c on c.brand = t.brand left join top on top.brand = t.brand
        order by t.amount desc limit 60`),
    db.execute<{
      sku: string | null
      name: string | null
      key: string | null
      brand: string | null
      amount: string
      tickets: string
      qty: string
      clients: string
    }>(sql`
        select coalesce(l.sku, l.product_name) as sku, max(l.product_name) as name,
               max(l.category_key) as key, max(l.brand) as brand,
               coalesce(sum(l.total), 0) as amount, count(distinct l.sale_id) as tickets,
               coalesce(sum(l.qty), 0) as qty, count(distinct s.client_id) as clients
        from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
        where ${where} and coalesce(l.sku, l.product_name) is not null
        group by coalesce(l.sku, l.product_name) order by amount desc limit 40`),
    db.execute<{ month: string; key: string | null; amount: string }>(sql`
        select to_char(s.sold_on, 'YYYY-MM') as month, l.category_key as key, coalesce(sum(l.total), 0) as amount
        from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
        where ${where}
        group by 1, 2 order by 1`),
    db.execute<{ lines: string; amount: string }>(sql`
        select count(*) as lines, coalesce(sum(l.total), 0) as amount
        from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
        where ${where} and l.category_key is null`),
    frequencyBy(sql`l.category_key`, whereFreq),
    frequencyBy(sql`l.brand`, whereFreq),
    frequencyBy(sql`coalesce(l.sku, l.product_name)`, whereFreq),
  ])

  const t = totals.rows[0]
  const totalAmount = num(t?.amount)
  const totalSales = num(t?.sales)

  const categoryRows: CategoryRow[] = categories.rows.map((c) => {
    const amount = r2(num(c.amount))
    const tickets = num(c.tickets)
    const fq = catFreq.get(c.key)
    return {
      key: c.key,
      species: speciesOfKey(c.key),
      leaf: leafOfKey(c.key),
      label: categoryLabel(c.key),
      amount,
      share: totalAmount > 0 ? r2((amount / totalAmount) * 100) : 0,
      tickets,
      avgTicket: tickets > 0 ? r2(amount / tickets) : null,
      qty: r2(num(c.qty)),
      clients: num(c.clients),
      buyersNoCard: num(c.buyers_no_card),
      frequencyDays: fq?.days ?? null,
      frequencySample: fq?.sample ?? 0,
    }
  })

  const brandRows: BrandRow[] = brands.rows.map((b) => {
    const amount = r2(num(b.amount))
    return {
      brand: b.brand,
      amount,
      share: totalAmount > 0 ? r2((amount / totalAmount) * 100) : 0,
      tickets: num(b.tickets),
      clients: num(b.clients),
      frequencyDays: brandFreq.get(b.brand)?.days ?? null,
      topCategory: b.top_key ? categoryLabel(b.top_key) : null,
      topCategoryShare: b.top_key && amount > 0 ? r2((num(b.top_amount) / amount) * 100) : null,
    }
  })

  const productRows: ProductRow[] = products.rows.map((p) => ({
    sku: p.sku,
    name: p.name,
    categoryKey: p.key,
    brand: p.brand,
    amount: r2(num(p.amount)),
    tickets: num(p.tickets),
    qty: r2(num(p.qty)),
    clients: num(p.clients),
    frequencyDays: p.sku ? (skuFreq.get(p.sku)?.days ?? null) : null,
  }))

  const trendKeys = categoryRows.slice(0, 5).map((c) => c.key)
  const byMonth = new Map<string, { total: number; byCategory: Record<string, number> }>()
  for (const row of trend.rows) {
    const m = byMonth.get(row.month) ?? { total: 0, byCategory: {} }
    const amount = num(row.amount)
    m.total += amount
    if (row.key && trendKeys.includes(row.key)) {
      m.byCategory[row.key] = r2((m.byCategory[row.key] ?? 0) + amount)
    }
    byMonth.set(row.month, m)
  }
  const trendRows = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, m]) => ({ month, total: r2(m.total), byCategory: m.byCategory }))

  const u = unclassified.rows[0]
  return {
    filters: f,
    stores,
    hasData: totalSales > 0,
    totals: {
      sales: totalSales,
      amount: r2(totalAmount),
      avgTicket: totalSales > 0 ? r2(totalAmount / totalSales) : null,
      clients: num(t?.clients),
      buyersNoCard: num(t?.buyers_no_card),
      guestSales: num(t?.guest_sales),
      cuikAmountShare: totalAmount > 0 ? r2((num(t?.cuik_amount) / totalAmount) * 100) : null,
      cuikSalesShare: totalSales > 0 ? r2((num(t?.cuik_sales) / totalSales) * 100) : null,
      lines: num(t?.lines),
    },
    categories: categoryRows,
    brands: brandRows,
    products: productRows,
    trend: trendRows,
    trendKeys,
    unclassified: { lines: num(u?.lines), amount: r2(num(u?.amount)) },
  }
}

/**
 * Median days between two purchases of the same client within one group
 * (category, brand or SKU), over the frequency window; `sample` is how many
 * intervals the median rests on.
 */
async function frequencyBy(
  groupExpr: ReturnType<typeof sql>,
  whereFreq: ReturnType<typeof sql>,
): Promise<Map<string, { days: number; sample: number }>> {
  const rows = await db.execute<{ g: string; days: string; sample: string }>(sql`
    with p as (
      select distinct s.client_id, ${groupExpr} as g, s.sold_on
      from analytics.sale_lines l join analytics.sales s on s.id = l.sale_id
      where ${whereFreq} and ${groupExpr} is not null
    ), d as (
      select g, sold_on - lag(sold_on) over (partition by client_id, g order by sold_on) as gap from p
    )
    select g, percentile_cont(0.5) within group (order by gap) as days, count(gap) as sample
    from d where gap is not null and gap > 0 group by g having count(gap) >= 3`)
  return new Map(
    rows.rows.map((r) => [r.g, { days: Math.round(num(r.days) * 10) / 10, sample: num(r.sample) }]),
  )
}

/** Default period: the last 3 full months plus the current one, tenant-local. */
export async function defaultPurchaseRange(
  tenantId: string,
): Promise<{ from: string; to: string; timezone: string }> {
  const [t] = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const timezone = t?.timezone ?? "America/Lima"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone })
  const [y, m] = today.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1 - 3, 1)).toISOString().slice(0, 10)
  return { from: start, to: today, timezone }
}
