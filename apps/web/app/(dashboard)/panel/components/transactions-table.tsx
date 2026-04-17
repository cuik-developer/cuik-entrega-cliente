"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Transaction = {
  id: string
  visitNum: number
  cycleNumber: number
  createdAt: string
  clientName: string
  clientLastName: string | null
}

export function TransactionsTable({
  data,
  timezone = "America/Lima",
}: {
  data: Transaction[]
  timezone?: string
}) {
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    })
  }

  // YYYY-MM-DD in the tenant's timezone
  const tzDateKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: timezone })

  const todayKey = tzDateKey(new Date())
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayKey = tzDateKey(yesterdayDate)

  const formatDatePart = (dateStr: string) => {
    const d = new Date(dateStr)
    const key = tzDateKey(d)
    if (key === todayKey) return "Hoy"
    if (key === yesterdayKey) return "Ayer"
    return d
      .toLocaleDateString("es-PE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: timezone,
      })
      .replace(/\.$/, "")
  }

  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-700">Transacciones recientes</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Sin transacciones recientes</p>
        ) : (
          <div className="space-y-0">
            {data.map((tx) => (
              <div
                key={tx.id}
                className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0"
              >
                <div className="flex flex-col items-end w-20 flex-shrink-0">
                  <span className="text-[11px] font-medium text-slate-500 leading-tight">
                    {formatDatePart(tx.createdAt)}
                  </span>
                  <span className="text-xs font-mono text-slate-400 leading-tight">
                    {formatTime(tx.createdAt)}
                  </span>
                </div>
                <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-800 text-sm">
                    {tx.clientName} {tx.clientLastName || ""}
                  </span>
                  <span className="text-slate-500 text-sm">
                    {" "}
                    · Sello {tx.visitNum} (ciclo {tx.cycleNumber})
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
