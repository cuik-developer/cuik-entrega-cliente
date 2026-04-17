"use client"

import { Download, Loader2 } from "lucide-react"
import * as React from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"

function formatYMD(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" })
}

export function ExportButton() {
  const [loading, setLoading] = React.useState(false)
  const [range, setRange] = React.useState<DateRange | undefined>(undefined)
  const [minDate, setMinDate] = React.useState<Date | undefined>(undefined)

  React.useEffect(() => {
    fetch("/api/admin/reports/first-visit")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.firstVisitDate) {
          const [y, m, d] = (j.data.firstVisitDate as string).split("-").map(Number)
          setMinDate(new Date(y, m - 1, d))
        }
      })
      .catch(() => {
        // silently degrade — picker allows any date
      })
  }, [])

  async function handleExport() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (range?.from && range.to) {
        params.set("from", formatYMD(range.from))
        params.set("to", formatYMD(range.to))
      }
      const url = `/api/admin/reports/export${params.toString() ? `?${params}` : ""}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Error al generar reporte")
      const blob = await res.blob()
      const dl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = dl
      a.download = `cuik-datos-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(dl)
    } catch {
      alert("Error al exportar datos. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <DateRangePicker
        value={range}
        onChange={setRange}
        minDate={minDate}
        active={Boolean(range?.from && range?.to)}
      />
      <Button onClick={handleExport} disabled={loading} variant="outline" size="sm">
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {loading ? "Generando..." : "Exportar Datos"}
      </Button>
    </div>
  )
}
