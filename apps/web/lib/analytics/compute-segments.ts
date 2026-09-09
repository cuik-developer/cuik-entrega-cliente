import { and, clients, db, eq, ne } from "@cuik/db"
import type { SegmentsData } from "@cuik/shared/types/analytics"
import type { ClientSegment, SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { computeClientSegment } from "@/lib/loyalty/client-segments"
import { parseAvgDays, parseVisitDate, visitStatsSubquery } from "@/lib/loyalty/visit-stats"

export const SEGMENT_ORDER: ClientSegment[] = [
  "nuevo",
  "frecuente",
  "esporadico",
  "regular",
  "en_riesgo",
  "one_time",
  "inactivo",
]

type SegmentInputRow = {
  createdAt: Date
  totalVisits: number
  lastVisitAt: Date | string | null
  avgDaysBetweenVisits: string | number | null
}

/** Pure tally — same engine the Clientes list uses, so both screens agree. */
export function tallySegments(
  rows: SegmentInputRow[],
  thresholds: SegmentationThresholds,
): SegmentsData {
  const counts = new Map<ClientSegment, number>(SEGMENT_ORDER.map((s) => [s, 0]))
  for (const row of rows) {
    const segment = computeClientSegment(
      {
        createdAt: row.createdAt,
        totalVisits: row.totalVisits,
        lastVisitAt: parseVisitDate(row.lastVisitAt),
        avgDaysBetweenVisits: parseAvgDays(row.avgDaysBetweenVisits),
      },
      thresholds,
    )
    counts.set(segment, (counts.get(segment) ?? 0) + 1)
  }
  return {
    segments: SEGMENT_ORDER.map((segment) => ({ segment, count: counts.get(segment) ?? 0 })),
    total: rows.length,
  }
}

/**
 * Snapshot of how the (non-blocked) client base splits across behavioural
 * segments right now. Segments are derived, never stored, so this walks every
 * client with the same LEFT JOINed visit stats the Clientes list uses.
 */
export async function computeSegmentDistribution(
  tenantId: string,
  thresholds: SegmentationThresholds,
): Promise<SegmentsData> {
  const vs = visitStatsSubquery(tenantId)
  const rows = await db
    .select({
      createdAt: clients.createdAt,
      totalVisits: clients.totalVisits,
      lastVisitAt: vs.lastVisitAt,
      avgDaysBetweenVisits: vs.avgDaysBetweenVisits,
    })
    .from(clients)
    .leftJoin(vs, eq(vs.clientId, clients.id))
    .where(and(eq(clients.tenantId, tenantId), ne(clients.status, "blocked")))

  return tallySegments(rows, thresholds)
}
