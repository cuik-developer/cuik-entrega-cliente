"use client"

import { MapPin } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type LocationOption = { id: string; name: string }

export const ALL_LOCATIONS = "all"

type Props = {
  locations: LocationOption[]
  value: string
  onChange: (locationId: string) => void
}

/** Branch filter. Renders nothing for single-branch tenants — there is nothing to choose. */
export function LocationSelect({ locations, value, onChange }: Props) {
  if (locations.length < 2) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 text-[12px] w-44 gap-1.5" aria-label="Sucursal">
        <MapPin className="w-3.5 h-3.5 text-ent-fg-3 shrink-0" />
        <SelectValue placeholder="Sucursal" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_LOCATIONS}>Todas las sucursales</SelectItem>
        {locations.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
