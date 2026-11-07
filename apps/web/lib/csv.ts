/**
 * A CSV cell Excel will treat as text. Values typed by the public (client
 * names) that start with = + - @ or a tab/CR would run as a formula when the
 * merchant opens the file, so they get a leading apostrophe; quotes are doubled.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
