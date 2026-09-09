"use client"

import type { HeatmapData } from "@cuik/shared/types/analytics"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { hourLabel } from "@/lib/analytics/hour-label"

// ISO weekday: 1 = Monday … 7 = Sunday (what EXTRACT(ISODOW) returns).
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
// Business hours shown in the grid (8am–8pm). Visits outside are counted in a
// footnote rather than hidden; the API still returns all 24 hours.
const FIRST_HOUR = 8
const LAST_HOUR = 20
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
// Column labels: 9am · 11am · 1pm · 3pm · 5pm · 7pm
const LABELED_HOURS = new Set([9, 11, 13, 15, 17, 19])
const GRID_COLS = `2.5rem repeat(${HOURS.length}, minmax(0, 1fr))`

type Props = {
  data: HeatmapData
  /** Shown under the title, e.g. "Sede Principal" when a branch filter is active. */
  scopeLabel?: string
}

/** Opacity steps against the brand colour; 0 visits renders as the muted grid. */
function cellStyle(visits: number, max: number): React.CSSProperties | undefined {
  if (visits === 0 || max === 0) return undefined
  const ratio = visits / max
  const opacity = 0.18 + ratio * 0.82
  return {
    backgroundColor: `color-mix(in srgb, var(--color-primary) ${Math.round(opacity * 100)}%, transparent)`,
  }
}

export function VisitsHeatmap({ data, scopeLabel }: Props) {
  // Fill the 7×24 grid; the API only sends non-empty cells.
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  let max = 0
  for (const c of data.cells) {
    if (c.dow < 1 || c.dow > 7 || c.hour < 0 || c.hour > 23) continue
    grid[c.dow - 1][c.hour] += c.visits
    if (grid[c.dow - 1][c.hour] > max) max = grid[c.dow - 1][c.hour]
  }

  // Peak cell + busiest day, for the one-line takeaway under the grid.
  let peak: { dow: number; hour: number; visits: number } | null = null
  const perDay = grid.map((row) => row.reduce((a, b) => a + b, 0))
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = grid[d][h]
      if (v > 0 && (peak === null || v > peak.visits)) peak = { dow: d, hour: h, visits: v }
    }
  }
  const busiestDay = perDay.indexOf(Math.max(...perDay))
  const outsideHours = grid.reduce(
    (acc, row) => acc + row.reduce((a, v, h) => (h < FIRST_HOUR || h > LAST_HOUR ? a + v : a), 0),
    0,
  )

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">Visitas por día y hora</CardTitle>
        <p className="text-xs text-muted-foreground">
          {scopeLabel ? `${scopeLabel} · ` : ""}En qué momentos de la semana llegan tus clientes.
        </p>
      </CardHeader>
      <CardContent>
        {data.totalVisits === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin visitas en el período seleccionado.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                {/* Hour header */}
                <div className="grid gap-px" style={{ gridTemplateColumns: GRID_COLS }}>
                  <div />
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="text-[10px] text-muted-foreground text-center tabular-nums leading-4"
                    >
                      {LABELED_HOURS.has(h) ? hourLabel(h) : ""}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {DAYS.map((day, d) => (
                  <div
                    key={day}
                    className="grid gap-px mt-px"
                    style={{ gridTemplateColumns: GRID_COLS }}
                  >
                    <div className="text-xs text-muted-foreground pr-2 flex items-center justify-end">
                      {day}
                    </div>
                    {HOURS.map((h) => {
                      const v = grid[d][h]
                      return (
                        <div
                          key={h}
                          title={`${day} ${hourLabel(h)} · ${v} visita${v === 1 ? "" : "s"}`}
                          className={`h-6 rounded-sm ${v === 0 ? "bg-muted" : ""}`}
                          style={cellStyle(v, max)}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs text-muted-foreground">
              <span>
                {peak && (
                  <>
                    Pico:{" "}
                    <span className="font-semibold text-foreground">
                      {DAYS[peak.dow]} {hourLabel(peak.hour)}
                    </span>{" "}
                    ({peak.visits} visita{peak.visits === 1 ? "" : "s"}) · Día más fuerte:{" "}
                    <span className="font-semibold text-foreground">{DAYS[busiestDay]}</span> (
                    {perDay[busiestDay]})
                  </>
                )}
                {outsideHours > 0 && (
                  <>
                    {" "}
                    · {outsideHours} visita{outsideHours === 1 ? "" : "s"} fuera de{" "}
                    {hourLabel(FIRST_HOUR)}–{hourLabel(LAST_HOUR)}
                  </>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                Menos
                <span className="flex gap-0.5">
                  {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                    <span
                      key={r}
                      className={`w-4 h-3 rounded-sm ${r === 0 ? "bg-muted" : ""}`}
                      style={r === 0 ? undefined : cellStyle(r, 1)}
                    />
                  ))}
                </span>
                Más
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
