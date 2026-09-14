"use client"

import { FileSpreadsheet, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/** The last 12 closed months as "YYYY-MM", newest first, in the tenant's timezone. */
function closedMonths(timezone: string, count = 12): Array<{ value: string; label: string }> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone })
  let [y, m] = today.split("-").map(Number)
  const out: Array<{ value: string; label: string }> = []
  for (let i = 0; i < count; i++) {
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
    out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}` })
  }
  return out
}

/**
 * "Descargar acumulado hasta…": the all-time Excel (totals since the business
 * started, month by month, top 20, segments) up to the end of a chosen month.
 */
export function CumulativeExportButton({
  tenantSlug,
  timezone,
}: {
  tenantSlug: string
  timezone: string
}) {
  const options = closedMonths(timezone)
  const [until, setUntil] = useState(options[0]?.value ?? "")
  const [busy, setBusy] = useState(false)

  async function download() {
    if (!until) return
    setBusy(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/reports/export?until=${until}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${tenantSlug}-acumulado-hasta-${until}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("No se pudo generar el acumulado")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={until} onValueChange={setUntil}>
        <SelectTrigger size="sm" className="h-8 text-xs w-[175px]" aria-label="Acumulado hasta">
          <SelectValue placeholder="Hasta…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              hasta {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="text-xs h-8 gap-1.5"
        onClick={download}
        disabled={busy || !until}
        type="button"
        title="Excel con tu historia completa hasta el cierre del mes elegido"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Acumulado</span>
      </Button>
    </div>
  )
}
