import { sql } from "@cuik/db"

/**
 * Returns the tenant timezone as an inlined SQL literal (`'America/Lima'`).
 *
 * Inlined on purpose: when the same tz appears in SELECT and GROUP BY, Drizzle
 * binds each `${tz}` as a separate `$N` parameter and PG then refuses the query
 * ("must appear in the GROUP BY clause") because the two expressions are no
 * longer byte-identical. The value is sanitised to IANA-compatible characters
 * so it is safe to inline.
 */
export function tenantTzLiteral(rawTz: string | null | undefined) {
  const tz = (rawTz ?? "America/Lima").replace(/[^A-Za-z0-9_/+-]/g, "") || "America/Lima"
  return sql.raw(`'${tz}'`)
}
