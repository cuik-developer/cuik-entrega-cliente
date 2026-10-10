"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  DataTable,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useTenant } from "@/hooks/use-tenant"

import type { LocationData } from "../actions"
import { addLocation, deleteLocation, toggleLocation } from "../actions"

/**
 * Sucursales: the physical locations a cashier picks when registering a
 * visit. Same server actions as before; only the rendering is the
 * enterprise table.
 */
export function LocationsSection({ initialLocations }: { initialLocations: LocationData[] }) {
  const { readOnly } = useTenant()
  const [locs, setLocs] = useState<LocationData[]>(initialLocations)
  const [locName, setLocName] = useState("")
  const [locAddress, setLocAddress] = useState("")
  const [isLocPending, startLocTransition] = useTransition()

  function handleAddLocation() {
    if (!locName.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }
    startLocTransition(async () => {
      const result = await addLocation(locName, locAddress)
      if (result.success) {
        setLocs((prev) => [...prev, result.data])
        setLocName("")
        setLocAddress("")
        toast.success("Sucursal agregada")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDeleteLocation(id: string) {
    startLocTransition(async () => {
      const result = await deleteLocation(id)
      if (result.success) {
        setLocs((prev) => prev.filter((l) => l.id !== id))
        toast.success("Sucursal eliminada")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleToggleLocation(id: string, active: boolean) {
    startLocTransition(async () => {
      const result = await toggleLocation(id, active)
      if (result.success) {
        setLocs((prev) => prev.map((l) => (l.id === id ? { ...l, active } : l)))
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <span>
            Sucursales
            {locs.length > 0 && (
              <span className="font-normal text-ent-fg-3 tabular-nums"> {locs.length}</span>
            )}
          </span>
        }
      />
      <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-b border-ent-line">
        Los cajeros eligen la sucursal al registrar una visita. Una sucursal inactiva deja de
        aparecer en el cajero sin perder su historial.
      </p>

      {locs.length === 0 ? (
        <PanelMessage className="py-6">
          Sin sucursales. Agrega una para que los cajeros puedan registrar visitas por ubicación.
        </PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Sucursal</Th>
              <Th>Dirección</Th>
              <Th>Estado</Th>
              <Th align="right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {locs.map((loc) => (
              <Tr key={loc.id}>
                <Td className="font-medium whitespace-normal">{loc.name}</Td>
                <Td className="text-ent-fg-2 whitespace-normal">{loc.address || "—"}</Td>
                <Td>
                  <StatusChip tone={loc.active ? "ok" : "mute"}>
                    {loc.active ? "Activa" : "Inactiva"}
                  </StatusChip>
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-2">
                    <Switch
                      checked={loc.active}
                      onCheckedChange={(checked) => handleToggleLocation(loc.id, checked)}
                      disabled={isLocPending || readOnly}
                      aria-label={`${loc.active ? "Desactivar" : "Activar"} ${loc.name}`}
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-ent-bad hover:text-ent-bad"
                        onClick={() => handleDeleteLocation(loc.id)}
                        disabled={isLocPending}
                        aria-label={`Eliminar ${loc.name}`}
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {!readOnly && (
        <div className="px-3 py-2.5 border-t border-ent-line flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Nombre de la sucursal"
            value={locName}
            onChange={(e) => setLocName(e.target.value)}
            className="h-7 text-[12.5px] sm:max-w-[220px]"
            aria-label="Nombre de la sucursal"
          />
          <Input
            placeholder="Dirección (opcional)"
            value={locAddress}
            onChange={(e) => setLocAddress(e.target.value)}
            className="h-7 text-[12.5px] sm:max-w-[320px]"
            aria-label="Dirección de la sucursal"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAddLocation}
            disabled={isLocPending || !locName.trim()}
            className="h-7 text-[12px] gap-1.5 self-start"
          >
            {isLocPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Agregar sucursal
          </Button>
        </div>
      )}
    </Panel>
  )
}
