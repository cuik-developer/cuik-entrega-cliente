"use client"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"

export type RetentionRow = {
  cohortMonth: string
  monthOffset: number
  clientsCount: number
  retentionPct: number
}

type Props = {
  data: RetentionRow[]
}

/** Accent at an opacity proportional to the retention; text flips to white past the midpoint. */
function cellStyle(pct: number): React.CSSProperties {
  const p = Math.max(0, Math.min(100, pct))
  return {
    backgroundColor: `color-mix(in srgb, var(--color-ent-accent) ${Math.round(10 + p * 0.9)}%, transparent)`,
    color: p >= 55 ? "#ffffff" : "var(--color-ent-fg)",
  }
}

function formatCohortLabel(cohortMonth: string): string {
  // "YYYY-MM-DD" → build from components; new Date("YYYY-MM-DD") is UTC midnight
  // and drifts to the previous month's last day in negative-offset browsers.
  const [y, m] = cohortMonth.split("-").map(Number)
  if (!y || !m) return cohortMonth
  const date = new Date(y, m - 1, 1, 12)
  return date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
}

export function RetentionHeatmap({ data }: Props) {
  // Group data by cohort month
  const cohorts = new Map<string, Map<number, RetentionRow>>()
  let maxOffset = 0
  for (const row of data) {
    if (!cohorts.has(row.cohortMonth)) cohorts.set(row.cohortMonth, new Map())
    cohorts.get(row.cohortMonth)?.set(row.monthOffset, row)
    if (row.monthOffset > maxOffset) maxOffset = row.monthOffset
  }
  const cohortKeys = Array.from(cohorts.keys()).sort()
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <Panel>
      <PanelHeader
        title="Retención por cohorte"
        actions={
          <span className="text-[11.5px] text-ent-fg-3">
            % de cada mes de alta que volvió N meses después
          </span>
        }
      />
      {data.length === 0 ? (
        <PanelMessage>Sin datos de retención disponibles.</PanelMessage>
      ) : (
        <div className="p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-separate border-spacing-px">
              <thead>
                <tr>
                  <th className="text-left pr-3 pb-1 font-medium text-ent-fg-3 whitespace-nowrap">
                    Cohorte
                  </th>
                  {offsets.map((offset) => (
                    <th
                      key={offset}
                      className="text-center pb-1 font-medium text-ent-fg-3 min-w-[3rem] tabular-nums"
                    >
                      M{offset}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortKeys.map((cohortMonth) => {
                  const cohortData = cohorts.get(cohortMonth)
                  const size = cohortData?.get(0)?.clientsCount
                  return (
                    <tr key={cohortMonth}>
                      <td className="pr-3 text-ent-fg whitespace-nowrap">
                        {formatCohortLabel(cohortMonth)}
                        {size !== undefined && (
                          <span className="ml-1.5 text-[11px] text-ent-fg-3 tabular-nums">
                            {size}
                          </span>
                        )}
                      </td>
                      {offsets.map((offset) => {
                        const row = cohortData?.get(offset)
                        if (!row) {
                          return (
                            <td key={offset}>
                              <div className="h-7 rounded-[2px] bg-ent-panel-2" />
                            </td>
                          )
                        }
                        const pct = Number(row.retentionPct)
                        return (
                          <td key={offset}>
                            <div
                              className="h-7 rounded-[2px] flex items-center justify-center font-medium tabular-nums"
                              style={cellStyle(pct)}
                              title={`${row.clientsCount} clientes (${pct}%)`}
                            >
                              {pct.toFixed(0)}%
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3 text-[11.5px] text-ent-fg-3">
            <span>0%</span>
            <div className="flex gap-0.5">
              {[10, 30, 50, 70, 90].map((p) => (
                <div key={p} className="w-5 h-3 rounded-[2px]" style={cellStyle(p)} />
              ))}
            </div>
            <span>100%</span>
          </div>
        </div>
      )}
    </Panel>
  )
}
