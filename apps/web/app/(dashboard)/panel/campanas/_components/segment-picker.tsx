"use client"

import type { SegmentFilter, SegmentPreset } from "@cuik/shared/types"
import { Calendar, Filter, Hash, Users } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PRESET_OPTIONS: {
  value: SegmentPreset | "personalizado"
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
]

interface SegmentPickerProps {
  value: SegmentFilter
  onChange: (filter: SegmentFilter) => void
  tenantSlug: string
}

export function SegmentPicker({ value, onChange, tenantSlug: _tenantSlug }: SegmentPickerProps) {
  const [isCustom, setIsCustom] = useState(!value.preset && (value.conditions?.length ?? 0) > 0)

  const currentPreset = isCustom ? "personalizado" : (value.preset ?? "todos")

  function handlePresetChange(preset: string) {
    if (preset === "personalizado") {
      setIsCustom(true)
      onChange({ conditions: value.conditions ?? [], tagIds: value.tagIds })
    } else {
      setIsCustom(false)
      onChange({ preset: preset as SegmentPreset })
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

      {!isCustom && selectedOption && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
          <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
          <Badge variant="secondary" className="ml-auto text-xs">
            {selectedOption.label}
          </Badge>
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
