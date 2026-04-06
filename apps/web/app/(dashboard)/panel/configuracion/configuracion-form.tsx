"use client"

import { BUSINESS_TYPES } from "@cuik/shared/constants"
import type { TenantConfigInput, WalletConfigLocationsInput } from "@cuik/shared/validators"
import { tenantConfigSchema, walletConfigLocationsSchema } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, Info, Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

import type { LocationData, TenantConfigData } from "./actions"
import {
  addLocation,
  deleteLocation,
  saveTenantConfig,
  saveWalletConfig,
  toggleLocation,
} from "./actions"

// ── Status badge color mapping ──────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-emerald-100 text-emerald-700" },
  trial: { label: "Prueba", className: "bg-blue-100 text-blue-700" },
  pending: { label: "Pendiente", className: "bg-amber-100 text-amber-700" },
  expired: { label: "Expirado", className: "bg-slate-100 text-muted-foreground" },
  paused: { label: "Pausado", className: "bg-slate-100 text-muted-foreground" },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-700" },
}

// ── Component ───────────────────────────────────────────────────────

interface ConfiguracionFormProps {
  initialData: TenantConfigData
  initialLocations: LocationData[]
}

export function ConfiguracionForm({ initialData, initialLocations }: ConfiguracionFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isWalletPending, startWalletTransition] = useTransition()

  // ── Sucursales state ──────────────────────────────────────────────
  const [locs, setLocs] = useState<LocationData[]>(initialLocations)
  const [locName, setLocName] = useState("")
  const [locAddress, setLocAddress] = useState("")
  const [isLocPending, startLocTransition] = useTransition()

  const form = useForm<TenantConfigInput>({
    resolver: zodResolver(tenantConfigSchema),
    defaultValues: {
      name: initialData.name,
      businessType: initialData.businessType ?? "",
      address: initialData.address ?? "",
      phone: initialData.phone ?? "",
      contactEmail: initialData.contactEmail ?? "",
    },
  })

  const walletForm = useForm<WalletConfigLocationsInput>({
    resolver: zodResolver(walletConfigLocationsSchema),
    defaultValues: {
      locations: initialData.walletConfig?.locations ?? [],
      relevantDateEnabled: initialData.walletConfig?.relevantDateEnabled ?? false,
    },
  })

  const {
    fields: locationFields,
    append,
    remove,
  } = useFieldArray({
    control: walletForm.control,
    name: "locations",
  })

  function onSubmit(data: TenantConfigInput) {
    startTransition(async () => {
      const result = await saveTenantConfig(data)
      if (result.success) {
        toast.success("Configuracion guardada")
      } else {
        toast.error(result.error)
      }
    })
  }

  function onWalletSubmit(data: WalletConfigLocationsInput) {
    startWalletTransition(async () => {
      const result = await saveWalletConfig(data)
      if (result.success) {
        toast.success("Configuracion de wallet guardada")
      } else {
        toast.error(result.error)
      }
    })
  }

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

  const statusStyle = STATUS_STYLES[initialData.status] ?? {
    label: initialData.status,
    className: "bg-slate-100 text-muted-foreground",
  }

  return (
    <div className="space-y-8">
      {/* ── Business info form ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-4">Informacion del negocio</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">
                      Nombre del negocio
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="businessType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">
                      Tipo de negocio
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_TYPES.map((bt) => (
                          <SelectItem key={bt.value} value={bt.value}>
                            {bt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground">
                    Direccion
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Av. Ejemplo 1234, Ciudad" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">
                      Telefono
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="+51 987 654 321" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground">
                      Correo de contacto
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="info@negocio.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isPending} className="bg-[#0e70db] text-white gap-2">
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Form>
      </section>

      {/* ── Plan info (read-only) ─────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-4">Plan actual</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3.5 bg-muted/50 rounded-xl">
            <div>
              <div className="font-bold text-foreground">
                {initialData.planName ?? "Sin plan asignado"}
              </div>
            </div>
            <Badge className={`ml-auto ${statusStyle.className}`}>{statusStyle.label}</Badge>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#0e70db]" />
            <span>Tu plan es gestionado por el equipo de Cuik. Para cambios, contactanos.</span>
          </div>
        </div>
      </section>

      {/* ── Sucursales (business locations) ────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Sucursales
        </h2>

        <div className="space-y-3">
          {locs.length === 0 && (
            <p className="text-sm text-muted-foreground/70 italic">
              Sin sucursales. Agrega una para que los cajeros puedan registrar visitas por
              ubicacion.
            </p>
          )}

          {locs.map((loc) => (
            <div key={loc.id} className="flex items-center gap-3 p-3.5 bg-muted/50 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">{loc.name}</div>
                {loc.address && (
                  <div className="text-xs text-muted-foreground truncate">{loc.address}</div>
                )}
              </div>
              <Switch
                checked={loc.active}
                onCheckedChange={(checked) => handleToggleLocation(loc.id, checked)}
                disabled={isLocPending}
              />
              <button
                type="button"
                onClick={() => handleDeleteLocation(loc.id)}
                disabled={isLocPending}
                className="p-1 rounded text-muted-foreground/70 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                aria-label={`Eliminar ${loc.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Add location inline form */}
          <div className="p-3.5 bg-muted/30 rounded-xl space-y-3 border border-dashed border-muted-foreground/20">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                placeholder="Nombre de la sucursal"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
              />
              <Input
                placeholder="Direccion (opcional)"
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleAddLocation}
              disabled={isLocPending || !locName.trim()}
              className="gap-1.5"
            >
              {isLocPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Agregar sucursal
            </Button>
          </div>
        </div>
      </section>

      {/* ── Wallet locations ──────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Wallet — Ubicaciones
        </h2>

        <Form {...walletForm}>
          <form onSubmit={walletForm.handleSubmit(onWalletSubmit)} className="space-y-5">
            {/* Locations list */}
            <div className="space-y-3">
              {locationFields.length === 0 && (
                <p className="text-sm text-muted-foreground/70 italic">
                  Sin ubicaciones. Agrega una para activar notificaciones por proximidad.
                </p>
              )}

              {locationFields.map((locField, index) => (
                <div key={locField.id} className="p-3.5 bg-muted/50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Ubicacion {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1 rounded text-muted-foreground/70 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label={`Eliminar ubicacion ${index + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <FormField
                    control={walletForm.control}
                    name={`locations.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-muted-foreground">
                          Nombre
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ej: Sucursal Centro" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={walletForm.control}
                      name={`locations.${index}.lat`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-muted-foreground">
                            Latitud
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="-12.0464"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={walletForm.control}
                      name={`locations.${index}.lng`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-muted-foreground">
                            Longitud
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="-77.0428"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={walletForm.control}
                    name={`locations.${index}.relevantText`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-muted-foreground">
                          Texto relevante (opcional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Ej: Estamos cerca! Pasa por tu sello"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}

              {locationFields.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ name: "", lat: 0, lng: 0, relevantText: "" })}
                  className="gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar ubicacion
                </Button>
              )}
            </div>

            {/* relevantDate toggle */}
            <div className="flex items-center justify-between p-3.5 bg-muted/50 rounded-xl">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Fecha relevante</span>
                  <div className="relative group">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/70 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover text-white text-xs rounded-lg w-64 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                      Cuando esta activo, el pase mostrara la fecha de la ultima visita en la
                      pantalla de bloqueo del celular, recordandole al cliente que vuelva.
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Muestra la fecha de ultima visita en la pantalla de bloqueo
                </p>
              </div>
              <FormField
                control={walletForm.control}
                name="relevantDateEnabled"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isWalletPending}
                className="bg-[#0e70db] text-white gap-2"
              >
                {isWalletPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isWalletPending ? "Guardando..." : "Guardar wallet"}
              </Button>
            </div>
          </form>
        </Form>
      </section>
    </div>
  )
}
