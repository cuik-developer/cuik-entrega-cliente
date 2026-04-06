"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type RetentionRow = {
  cohortMonth: string
  monthOffset: number
  clientsCount: number
  retentionPct: number
}

type Props = {
  data: RetentionRow[]
}

function getCellColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500/90 text-white"
  if (pct >= 60) return "bg-emerald-400/80 text-white"
  if (pct >= 40) return "bg-emerald-300/70 text-slate-900 dark:text-white"
  if (pct >= 20) return "bg-amber-300/60 text-slate-900 dark:text-white"
  if (pct > 0) return "bg-red-300/50 text-slate-900 dark:text-white"
  return "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600"
}

function formatCohortLabel(cohortMonth: string): string {
  const date = new Date(cohortMonth)
  return date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" })
}

export function RetentionHeatmap({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card className="border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-foreground">Retención por cohorte</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin datos de retención disponibles.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group data by cohort month
  const cohorts = new Map<string, Map<number, RetentionRow>>()
  let maxOffset = 0

  for (const row of data) {
    if (!cohorts.has(row.cohortMonth)) {
      cohorts.set(row.cohortMonth, new Map())
    }
    cohorts.get(row.cohortMonth)?.set(row.monthOffset, row)
    if (row.monthOffset > maxOffset) {
      maxOffset = row.monthOffset
    }
  }

  const cohortKeys = Array.from(cohorts.keys()).sort()
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">Retención por cohorte</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-2 pr-3 font-medium text-muted-foreground whitespace-nowrap">
                  Cohorte
                </th>
                {offsets.map((offset) => (
                  <th
                    key={offset}
                    className="text-center py-2 px-1 font-medium text-muted-foreground min-w-[3rem]"
                  >
                    M{offset}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortKeys.map((cohortMonth) => {
                const cohortData = cohorts.get(cohortMonth)
                return (
                  <tr key={cohortMonth}>
                    <td className="py-1 pr-3 font-medium text-foreground whitespace-nowrap">
                      {formatCohortLabel(cohortMonth)}
                    </td>
                    {offsets.map((offset) => {
                      const row = cohortData?.get(offset)
                      if (!row) {
                        return (
                          <td key={offset} className="py-1 px-1">
                            <div className="w-full h-8 rounded bg-slate-50 dark:bg-slate-800/50" />
                          </td>
                        )
                      }
                      return (
                        <td key={offset} className="py-1 px-1">
                          <div
                            className={`w-full h-8 rounded flex items-center justify-center font-semibold ${getCellColor(Number(row.retentionPct))}`}
                            title={`${row.clientsCount} clientes (${row.retentionPct}%)`}
                          >
                            {Number(row.retentionPct).toFixed(0)}%
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
        {/* Color legend */}
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
          <span>0%</span>
          <div className="flex gap-0.5">
            <div className="w-6 h-3 rounded-sm bg-red-300/50" />
            <div className="w-6 h-3 rounded-sm bg-amber-300/60" />
            <div className="w-6 h-3 rounded-sm bg-emerald-300/70" />
            <div className="w-6 h-3 rounded-sm bg-emerald-400/80" />
            <div className="w-6 h-3 rounded-sm bg-emerald-500/90" />
          </div>
          <span>100%</span>
        </div>
      </CardContent>
    </Card>
  )
}
