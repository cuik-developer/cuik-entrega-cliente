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
                className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0"
              >
                <span className="text-xs font-mono text-slate-400 w-10 flex-shrink-0">
                  {formatTime(tx.createdAt)}
                </span>
                <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />
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
