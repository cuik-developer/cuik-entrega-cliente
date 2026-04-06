/**
 * Generate an ETag string for Apple Wallet 304 Not Modified responses.
 *
 * Format: `"{serial}:{totalVisits}:{ISO}"` (including surrounding double quotes).
 * Pure function — no side effects.
 */
export function generateETag(serial: string, totalVisits: number, lastModified: Date): string {
  return `"${serial}:${totalVisits}:${lastModified.toISOString()}"`
}
