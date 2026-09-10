import { Badge } from "@/components/ui/badge"
import { SEGMENT_COLORS, SEGMENT_HINTS, SEGMENT_LABELS } from "@/lib/loyalty/client-segments"

/** The panel's one placeholder for a missing value. */
export const EMPTY = "—"

type SegmentKey = keyof typeof SEGMENT_LABELS

/** Behavioural segment (Nuevo, Frecuente, En riesgo…) with the criterion as tooltip. */
export function SegmentBadge({
  segment,
  className,
}: {
  segment: string | null
  className?: string
}) {
  if (!segment) return <span className="text-muted-foreground">{EMPTY}</span>
  const key = segment as SegmentKey
  return (
    <Badge
      className={`text-xs ${SEGMENT_COLORS[key] ?? "bg-slate-100 text-slate-600"} ${className ?? ""}`}
      title={SEGMENT_HINTS[key]}
    >
      {SEGMENT_LABELS[key] ?? segment}
    </Badge>
  )
}

const STATUS: Record<string, { label: string; className: string }> = {
  active: {
    label: "Activo",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  inactive: {
    label: "Inactivo",
    className: "bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
  },
  blocked: {
    label: "Bloqueado",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
}

/** Administrative status of a client (active / inactive / blocked). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, className: "bg-slate-100 text-slate-600" }
  return <Badge className={`text-xs ${s.className} ${className ?? ""}`}>{s.label}</Badge>
}
