import { sql } from "@cuik/db"

/**
 * Where a synced sale came from (`analytics.sales.source`). The connector
 * writes two kinds: the till's orders (`pos.order`) and the confirmed sales
 * orders of Odoo Ventas (`sale.order`: e-commerce, phone, orders a store
 * keys in for later pick-up). Both are real sales of the merchant, so every
 * screen that reads "the connector's sales" reads both; `file` rows come
 * from Impacto uploads and are not the connector's.
 */
export const POS_SOURCE = "pos"
export const SALE_ORDER_SOURCE = "sale_order"
export const CONNECTOR_SOURCES = [POS_SOURCE, SALE_ORDER_SOURCE] as const
export type ConnectorSource = (typeof CONNECTOR_SOURCES)[number]

/** `('pos', 'sale_order')` for raw SQL (`s.source in ${CONNECTOR_SOURCES_SQL}`). */
export const CONNECTOR_SOURCES_SQL = sql.raw(
  `(${CONNECTOR_SOURCES.map((s) => `'${s}'`).join(", ")})`,
)

/** Short label for screens and Excel ("POS", "Orden de venta"). */
export function sourceLabel(source: string | null | undefined): string {
  if (source === SALE_ORDER_SOURCE) return "Orden de venta"
  if (source === POS_SOURCE) return "POS"
  return source ?? ""
}
