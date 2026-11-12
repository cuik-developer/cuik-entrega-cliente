import { and, db, eq, isNull, products, saleLines, sql } from "@cuik/db"

import { brandOf, categoryKey, classifyLine } from "@/lib/growth/categories"
import { textArrayLiteral, uuidArrayLiteral } from "./pg-arrays"

/**
 * Classification of the lines sold (analytics.sale_lines.category_key and
 * brand). The product master is the source of truth: its category, class,
 * subclass and brand win; a SKU the master does not have falls back to the
 * Odoo category path and the brand in parentheses in the product name. The
 * sync classifies new lines as it writes them; this module reclassifies
 * what is already stored (after a master upload, or once per tenant after
 * the 0045 migration with "Reclasificar líneas"). A line that stays
 * unclassified (Odoo category "All", no master) is normal, so nothing runs
 * on a schedule from the data alone.
 */

export type MasterEntry = {
  category: string | null
  class: string | null
  subclass: string | null
  brand: string | null
}

/** The master's rows that classify or brand something (SKUs only known from Odoo are left out). */
export async function loadMaster(tenantId: string): Promise<Map<string, MasterEntry>> {
  const rows = await db
    .select({
      sku: products.sku,
      category: products.category,
      class: products.class,
      subclass: products.subclass,
      brand: products.brand,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        sql`(${products.category} IS NOT NULL OR ${products.class} IS NOT NULL OR ${products.subclass} IS NOT NULL OR ${products.brand} IS NOT NULL)`,
      ),
    )
  return new Map(rows.map((r) => [r.sku, r]))
}

const PAGE = 5000

/**
 * Recomputes category_key and brand for every line of the tenant, in pages.
 * Returns how many lines were written.
 */
export async function reclassifyLines(tenantId: string): Promise<number> {
  const master = await loadMaster(tenantId)
  let after: string | null = null
  let written = 0
  for (;;) {
    const page = await db
      .select({
        id: saleLines.id,
        sku: saleLines.sku,
        productName: saleLines.productName,
        odooCategory: saleLines.odooCategory,
      })
      .from(saleLines)
      .where(
        and(eq(saleLines.tenantId, tenantId), after ? sql`${saleLines.id} > ${after}` : sql`true`),
      )
      .orderBy(saleLines.id)
      .limit(PAGE)
    if (page.length === 0) break
    const ids: string[] = []
    const keys: string[] = []
    const brands: string[] = []
    for (const l of page) {
      const m = l.sku ? master.get(l.sku) : undefined
      const cls = classifyLine({
        odooCategory: l.odooCategory,
        masterCategory: m?.category,
        masterClass: m?.class,
        masterSubclass: m?.subclass,
        productName: l.productName,
      })
      ids.push(l.id)
      keys.push(categoryKey(cls) ?? "")
      brands.push(m?.brand ?? brandOf(l.productName) ?? "")
    }
    await db.execute(sql`
      UPDATE analytics.sale_lines l
      SET category_key = NULLIF(v.k, ''), brand = NULLIF(v.b, '')
      FROM (SELECT unnest(${uuidArrayLiteral(ids)}::uuid[]) AS id,
                   unnest(${textArrayLiteral(keys)}::text[]) AS k,
                   unnest(${textArrayLiteral(brands)}::text[]) AS b) v
      WHERE l.id = v.id
        AND (l.category_key IS DISTINCT FROM NULLIF(v.k, '') OR l.brand IS DISTINCT FROM NULLIF(v.b, ''))`)
    written += page.length
    after = page[page.length - 1].id
    if (page.length < PAGE) break
  }
  return written
}

/** Lines without a classification although they carry a SKU or an Odoo category (some never get one). */
export async function unclassifiedCount(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(saleLines)
    .where(
      and(
        eq(saleLines.tenantId, tenantId),
        isNull(saleLines.categoryKey),
        sql`(${saleLines.sku} IS NOT NULL OR ${saleLines.odooCategory} IS NOT NULL)`,
      ),
    )
  return row?.n ?? 0
}
