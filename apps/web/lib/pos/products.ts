import { and, db, eq, isNull, products, saleLines, sql } from "@cuik/db"

import { readSalesFile } from "@/lib/loyalty/impact/parse"
import { reclassifyLines } from "./classify"
import {
  buildMaster,
  detectMasterMapping,
  type MasterMapping,
  parseMasterMapping,
} from "./product-master"

/**
 * The product master in the database: upload (preview, then confirm with a
 * mapping) and a summary for the tenant page.
 */

export type MasterSummary = {
  /** SKUs in the master with at least a category. */
  classified: number
  /** SKUs the POS sold that the master does not classify. */
  unclassified: number
  /** Total products known (master + seen in sales). */
  total: number
  updatedAt: string | null
  /** Top unclassified SKUs by sales lines, for the operator to chase. */
  missing: { sku: string; name: string | null; odooCategory: string | null; lines: number }[]
}

export async function masterSummary(tenantId: string): Promise<MasterSummary> {
  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      classified: sql<number>`count(*) FILTER (WHERE ${products.category} IS NOT NULL)::int`,
      updatedAt: sql<
        string | null
      >`to_char(max(${products.updatedAt}) FILTER (WHERE ${products.category} IS NOT NULL), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId))
  const missing = await db
    .select({
      sku: saleLines.sku,
      name: sql<string | null>`max(${saleLines.productName})`,
      odooCategory: sql<string | null>`max(${saleLines.odooCategory})`,
      lines: sql<number>`count(*)::int`,
    })
    .from(saleLines)
    .leftJoin(
      products,
      and(eq(products.tenantId, saleLines.tenantId), eq(products.sku, saleLines.sku)),
    )
    .where(
      and(
        eq(saleLines.tenantId, tenantId),
        sql`${saleLines.sku} IS NOT NULL`,
        isNull(products.category),
      ),
    )
    .groupBy(saleLines.sku)
    .orderBy(sql`count(*) DESC`)
    .limit(200)
  return {
    classified: agg?.classified ?? 0,
    unclassified: missing.length,
    total: agg?.total ?? 0,
    updatedAt: agg?.updatedAt ?? null,
    missing: missing.map((m) => ({
      sku: m.sku as string,
      name: m.name,
      odooCategory: m.odooCategory,
      lines: m.lines,
    })),
  }
}

export type MasterPreview = {
  headers: string[]
  sample: unknown[][]
  rowsTotal: number
  mapping: MasterMapping
}

/** Step 1: read the file and propose a mapping; nothing is saved. */
export async function previewMaster(file: {
  name: string
  buffer: Buffer
}): Promise<MasterPreview | { error: string }> {
  const parsed = await readSalesFile(file.buffer, file.name)
  if ("error" in parsed) return parsed
  return {
    headers: parsed.headers,
    sample: parsed.rows
      .slice(0, 5)
      .map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : v))),
    rowsTotal: parsed.rows.length,
    mapping: detectMasterMapping(parsed.headers),
  }
}

export type MasterApplyResult = {
  rows: number
  rowsWithoutSku: number
  duplicates: number
  /** Products that were in the master before and are not in this file (kept, not deleted). */
  keptFromBefore: number
  /** Lines sold reclassified with the new master; null when that step failed. */
  reclassified: number | null
}

/** Step 2: with the confirmed mapping, upsert every SKU of the file. */
export async function applyMaster(params: {
  tenantId: string
  file: { name: string; buffer: Buffer }
  mapping: unknown
}): Promise<MasterApplyResult | { error: string }> {
  const parsed = await readSalesFile(params.file.buffer, params.file.name)
  if ("error" in parsed) return parsed
  const mapping = parseMasterMapping(params.mapping, parsed.headers.length)
  if (!mapping || mapping.sku === null) return { error: "Indica qué columna es el SKU" }
  if (mapping.category === null && mapping.class === null && mapping.subclass === null) {
    return { error: "Indica al menos la columna de categoría, clase o subclase" }
  }
  const built = buildMaster(parsed, mapping)
  if (built.rows.length === 0) return { error: "No se encontraron filas con SKU" }
  await db.transaction(async (tx) => {
    for (let i = 0; i < built.rows.length; i += 500) {
      await tx
        .insert(products)
        .values(
          built.rows.slice(i, i + 500).map((r) => ({
            tenantId: params.tenantId,
            sku: r.sku,
            name: r.name,
            category: r.category,
            class: r.class,
            subclass: r.subclass,
            brand: r.brand,
            packSize: r.packSize,
            durationDays: r.durationDays,
          })),
        )
        .onConflictDoUpdate({
          target: [products.tenantId, products.sku],
          set: {
            name: sql`coalesce(excluded.name, ${products.name})`,
            // Columns the file does not carry keep what the master had.
            category:
              mapping.category === null ? sql`${products.category}` : sql`excluded.category`,
            class: mapping.class === null ? sql`${products.class}` : sql`excluded.class`,
            subclass:
              mapping.subclass === null ? sql`${products.subclass}` : sql`excluded.subclass`,
            brand: mapping.brand === null ? sql`${products.brand}` : sql`excluded.brand`,
            packSize:
              mapping.packSize === null ? sql`${products.packSize}` : sql`excluded.pack_size`,
            durationDays:
              mapping.durationDays === null
                ? sql`${products.durationDays}`
                : sql`excluded.duration_days`,
            updatedAt: new Date(),
          },
        })
    }
  })
  // The lines sold carry the classification: a new master reclassifies them.
  // Best effort: the master is saved either way, and "Reclasificar líneas" can redo it.
  let reclassified: number | null = null
  try {
    reclassified = await reclassifyLines(params.tenantId)
  } catch (err) {
    console.error("[pos-master] reclassify failed", params.tenantId, err)
  }
  const [after] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.tenantId, params.tenantId), sql`${products.category} IS NOT NULL`))
  const classifiedInFile = built.rows.filter((r) => r.category).length
  return {
    rows: built.rows.length,
    rowsWithoutSku: built.rowsWithoutSku,
    duplicates: built.duplicates,
    keptFromBefore: Math.max(0, (after?.n ?? 0) - classifiedInFile),
    reclassified,
  }
}
