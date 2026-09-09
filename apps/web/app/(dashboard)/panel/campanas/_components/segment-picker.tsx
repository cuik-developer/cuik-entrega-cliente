"use client"

import type { SegmentFilter, SegmentPreset } from "@cuik/shared/types"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Hash,
  Loader2,
  Users,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type RejectedRow = {
  row: number
  dni: string | null
  phone: string | null
  reason: "not_found" | "blocked" | "duplicate" | "empty"
}

type ImportResult = {
  matched: { id: string; name: string; matchedBy: "dni" | "phone"; row: number }[]
  rejected: RejectedRow[]
  stats: { total: number; matched: number; rejected: number }
}

const PRESET_OPTIONS: {
  value: SegmentPreset | "personalizado" | "lista"
  label: string
  description: string
}[] = [
  { value: "todos", label: "Todos", description: "Todos los clientes registrados" },
  { value: "activos", label: "Activos", description: "Clientes con visita en los ultimos 30 dias" },
  { value: "inactivos", label: "Inactivos", description: "Sin visita en mas de 30 dias" },
  { value: "vip", label: "VIP", description: "Clientes en tier VIP" },
  { value: "nuevos", label: "Nuevos", description: "Registrados en los ultimos 7 dias" },
  {
    value: "frecuentes",
    label: "Frecuentes",
    description: "3+ visitas, promedio < 7 dias entre visitas",
  },
  {
    value: "esporadicos",
    label: "Esporadicos",
    description: "3+ visitas, promedio >= 7 dias entre visitas",
  },
  {
    value: "one_time",
    label: "Una visita",
    description: "Exactamente 1 visita hace 30+ dias",
  },
  {
    value: "en_riesgo",
    label: "En riesgo",
    description: "Eran frecuentes pero dejaron de venir",
  },
  { value: "personalizado", label: "Personalizado", description: "Filtros personalizados" },
  {
    value: "lista",
    label: "Lista personalizada (Excel)",
    description: "Sube un .xlsx con DNI y/o teléfono de los destinatarios",
  },
]

interface SegmentPickerProps {
  value: SegmentFilter
  onChange: (filter: SegmentFilter) => void
  tenantSlug: string
}

export function SegmentPicker({ value, onChange, tenantSlug }: SegmentPickerProps) {
  const [isCustom, setIsCustom] = useState(!value.preset && (value.conditions?.length ?? 0) > 0)
  const [isList, setIsList] = useState(value.clientIds !== undefined)
  const [uploading, setUploading] = useState(false)
  const [downloadingRejected, setDownloadingRejected] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentPreset = isList ? "lista" : isCustom ? "personalizado" : (value.preset ?? "todos")

  function handlePresetChange(preset: string) {
    setImportResult(null)
    if (preset === "lista") {
      setIsList(true)
      setIsCustom(false)
      // Empty list on purpose: zod min(1) blocks submit until a file is uploaded.
      onChange({ clientIds: [] })
    } else if (preset === "personalizado") {
      setIsList(false)
      setIsCustom(true)
      onChange({ conditions: value.conditions ?? [], tagIds: value.tagIds })
    } else {
      setIsList(false)
      setIsCustom(false)
      onChange({ preset: preset as SegmentPreset })
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setImportResult(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch(`/api/${tenantSlug}/campaigns/import-recipients`, {
        method: "POST",
        body,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "No se pudo procesar el archivo")
        onChange({ clientIds: [] })
        return
      }
      const result = json.data as ImportResult
      setImportResult(result)
      onChange({ clientIds: result.matched.map((m) => m.id) })
      if (result.stats.matched === 0) {
        toast.error("Ningún DNI o teléfono del archivo coincide con tus clientes")
      }
    } catch {
      toast.error("Error de conexión al subir el archivo")
      onChange({ clientIds: [] })
    } finally {
      setUploading(false)
      // Allow re-selecting the same file to re-upload after fixing it.
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDownloadRejected() {
    if (!importResult || importResult.rejected.length === 0) return
    setDownloadingRejected(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/campaigns/import-recipients/rejected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejected: importResult.rejected }),
      })
      if (!res.ok) {
        toast.error("No se pudo generar el archivo de rechazados")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rechazados-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Error de conexión al descargar")
    } finally {
      setDownloadingRejected(false)
    }
  }

  function handleMinVisitsChange(val: string) {
    const num = val === "" ? undefined : Number.parseInt(val, 10)
    const conditions = [...(value.conditions ?? [])]

    const idx = conditions.findIndex((c) => c.field === "totalVisits" && c.operator === "gte")

    if (num === undefined || Number.isNaN(num)) {
      if (idx >= 0) conditions.splice(idx, 1)
    } else if (idx >= 0) {
      conditions[idx] = { field: "totalVisits", operator: "gte", value: num }
    } else {
      conditions.push({ field: "totalVisits", operator: "gte", value: num })
    }

    onChange({ ...value, preset: undefined, conditions })
  }

  function handleMaxVisitsChange(val: string) {
    const num = val === "" ? undefined : Number.parseInt(val, 10)
    const conditions = [...(value.conditions ?? [])]

    const idx = conditions.findIndex((c) => c.field === "totalVisits" && c.operator === "lte")

    if (num === undefined || Number.isNaN(num)) {
      if (idx >= 0) conditions.splice(idx, 1)
    } else if (idx >= 0) {
      conditions[idx] = { field: "totalVisits", operator: "lte", value: num }
    } else {
      conditions.push({ field: "totalVisits", operator: "lte", value: num })
    }

    onChange({ ...value, preset: undefined, conditions })
  }

  function handleLastVisitAfterChange(val: string) {
    const conditions = [...(value.conditions ?? [])]

    const idx = conditions.findIndex((c) => c.field === "lastVisitAt" && c.operator === "gte")

    if (!val) {
      if (idx >= 0) conditions.splice(idx, 1)
    } else if (idx >= 0) {
      conditions[idx] = { field: "lastVisitAt", operator: "gte", value: val }
    } else {
      conditions.push({ field: "lastVisitAt", operator: "gte", value: val })
    }

    onChange({ ...value, preset: undefined, conditions })
  }

  function handleLastVisitBeforeChange(val: string) {
    const conditions = [...(value.conditions ?? [])]

    const idx = conditions.findIndex((c) => c.field === "lastVisitAt" && c.operator === "lte")

    if (!val) {
      if (idx >= 0) conditions.splice(idx, 1)
    } else if (idx >= 0) {
      conditions[idx] = { field: "lastVisitAt", operator: "lte", value: val }
    } else {
      conditions.push({ field: "lastVisitAt", operator: "lte", value: val })
    }

    onChange({ ...value, preset: undefined, conditions })
  }

  // Extract current custom filter values
  const minVisits = value.conditions?.find((c) => c.field === "totalVisits" && c.operator === "gte")
    ?.value as number | undefined

  const maxVisits = value.conditions?.find((c) => c.field === "totalVisits" && c.operator === "lte")
    ?.value as number | undefined

  const lastVisitAfter = value.conditions?.find(
    (c) => c.field === "lastVisitAt" && c.operator === "gte",
  )?.value as string | undefined

  const lastVisitBefore = value.conditions?.find(
    (c) => c.field === "lastVisitAt" && c.operator === "lte",
  )?.value as string | undefined

  const selectedOption = PRESET_OPTIONS.find((o) => o.value === currentPreset)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <Label className="text-sm font-semibold">Segmento</Label>
      </div>

      <Select value={currentPreset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Seleccionar segmento" />
        </SelectTrigger>
        <SelectContent>
          {PRESET_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex items-center gap-2">
                <span>{opt.label}</span>
                <span className="text-muted-foreground text-xs hidden sm:inline">
                  — {opt.description}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isCustom && !isList && selectedOption && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
          <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
          <Badge variant="secondary" className="ml-auto text-xs">
            {selectedOption.label}
          </Badge>
        </div>
      )}

      {isList && (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="w-3 h-3" />
              Archivo .xlsx (máx. 20.000 filas)
            </Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={uploading}
              onChange={handleFileChange}
            />
            <p className="text-[11px] text-muted-foreground">
              Columnas <span className="font-mono">DNI</span> y/o{" "}
              <span className="font-mono">Teléfono</span> (con o sin encabezado). Formatea la
              columna DNI como texto para conservar ceros a la izquierda.
            </p>
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Cruzando con tus clientes…
            </div>
          )}

          {importResult && !uploading && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {importResult.stats.matched} encontrados
                </Badge>
                {importResult.stats.rejected > 0 && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-amber-100 text-amber-800 border-amber-200"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {importResult.stats.rejected} rechazados
                  </Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  de {importResult.stats.total} filas
                </span>
              </div>
              {importResult.stats.rejected > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={handleDownloadRejected}
                  disabled={downloadingRejected}
                >
                  {downloadingRejected ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Descargar rechazados
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {isCustom && (
        <div className="space-y-4 rounded-lg border border-dashed p-4">
          <p className="text-xs font-medium text-muted-foreground">Filtros personalizados</p>

          {/* Visit count range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3 h-3" />
                Min. visitas
              </Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={minVisits ?? ""}
                onChange={(e) => handleMinVisitsChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3 h-3" />
                Max. visitas
              </Label>
              <Input
                type="number"
                min={0}
                placeholder="Sin limite"
                value={maxVisits ?? ""}
                onChange={(e) => handleMaxVisitsChange(e.target.value)}
              />
            </div>
          </div>

          {/* Last visit date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Ultima visita despues de
              </Label>
              <Input
                type="date"
                value={lastVisitAfter ?? ""}
                onChange={(e) => handleLastVisitAfterChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Ultima visita antes de
              </Label>
              <Input
                type="date"
                value={lastVisitBefore ?? ""}
                onChange={(e) => handleLastVisitBeforeChange(e.target.value)}
              />
            </div>
          </div>

          {(value.conditions?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.conditions?.map((c) => (
                <Badge
                  key={`${c.field}-${c.operator}-${c.value}`}
                  variant="outline"
                  className="text-xs"
                >
                  {c.field} {c.operator} {c.value}
                  {c.valueTo ? ` - ${c.valueTo}` : ""}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
