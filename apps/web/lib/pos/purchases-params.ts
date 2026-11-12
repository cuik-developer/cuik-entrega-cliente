import { defaultPurchaseRange, type PurchaseFilters } from "./purchases"

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Query of the purchases screens: from, to (tenant-local days; "all" since
 * 2000), store, cuik=1. Missing dates fall back to the last three months.
 */
export async function parsePurchaseParams(
  url: URL,
  tenantId: string,
): Promise<{ filters: PurchaseFilters; timezone: string } | { error: string }> {
  const def = await defaultPurchaseRange(tenantId)
  let from = url.searchParams.get("from") ?? def.from
  const to = url.searchParams.get("to") ?? def.to
  if (from === "all") from = "2000-01-01"
  if (!YMD.test(from) || !YMD.test(to) || from > to) return { error: "Rango inválido" }
  const store = url.searchParams.get("store")?.trim() || null
  if (store && store.length > 120) return { error: "Tienda inválida" }
  return {
    filters: { from, to, store, cuikOnly: url.searchParams.get("cuik") === "1" },
    timezone: def.timezone,
  }
}

export function exportFileName(tenantName: string, f: PurchaseFilters): string {
  const safe = tenantName.replace(/[^\w\s-]/g, "").trim() || "comercio"
  return `Compras - ${safe} - ${f.from} a ${f.to}${f.cuikOnly ? " - clientes Cuik" : ""}.xlsx`
}
