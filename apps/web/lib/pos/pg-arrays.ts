/**
 * Array parameters for raw SQL. Drizzle expands a JS array into a row
 * `($1, $2, …)`, so an `anyarray` parameter goes as one Postgres literal.
 */

/** Plain words as a Postgres text[] literal ('{"a","b"}'). */
export function textArrayLiteral(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`
}

/** UUIDs as a Postgres array literal ("{a,b}"), the shape a `uuid[]` parameter needs. */
export function uuidArrayLiteral(ids: string[]): string {
  return `{${ids.join(",")}}`
}
