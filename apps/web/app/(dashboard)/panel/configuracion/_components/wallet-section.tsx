"use client"

import type { WalletConfigLocationsInput } from "@cuik/shared/validators"
import { walletConfigLocationsSchema } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { useTransition } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
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
import { Switch } from "@/components/ui/switch"
import { useTenant } from "@/hooks/use-tenant"

import type { TenantConfigData } from "../actions"
import { saveWalletConfig } from "../actions"

const LABEL = "text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 font-normal"
const INPUT = "h-7 text-[12.5px]"

/**
 * Pase y wallet: the geolocations that make the pass surface on the lock
 * screen near the shop, and the "relevant date" toggle. Same action and
 * schema as before.
 */
export function WalletSection({ initialData }: { initialData: TenantConfigData }) {
  const { readOnly } = useTenant()
  const [isWalletPending, startWalletTransition] = useTransition()

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

  return (
    <Form {...walletForm}>
      <form onSubmit={walletForm.handleSubmit(onWalletSubmit)} className="space-y-3">
        <Panel>
          <PanelHeader
            title={
              <span>
                Ubicaciones del pase
                {locationFields.length > 0 && (
                  <span className="font-normal text-ent-fg-3 tabular-nums">
                    {" "}
                    {locationFields.length}/10
                  </span>
                )}
              </span>
            }
            actions={
              locationFields.length < 10 &&
              !readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[12px] gap-1"
                  onClick={() => append({ name: "", lat: 0, lng: 0, relevantText: "" })}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar ubicación
                </Button>
              )
            }
          />
          <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-b border-ent-line">
            Cuando el cliente está cerca de una de estas coordenadas, su pase aparece en la pantalla
            de bloqueo con el texto que definas.
          </p>

          {locationFields.length === 0 ? (
            <PanelMessage className="py-6">
              Sin ubicaciones. Agrega una para activar notificaciones por proximidad.
            </PanelMessage>
          ) : (
            <div className="divide-y divide-ent-line">
              {locationFields.map((locField, index) => (
                <div key={locField.id} className="px-3 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ent-fg">
                      Ubicación {index + 1}
                    </span>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-ent-bad hover:text-ent-bad"
                        onClick={() => remove(index)}
                        aria-label={`Eliminar ubicacion ${index + 1}`}
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-[1fr_120px_120px] gap-2">
                    <FormField
                      control={walletForm.control}
                      name={`locations.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="gap-1">
                          <FormLabel className={LABEL}>Nombre</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Ej: Sucursal Centro"
                              className={INPUT}
                              disabled={readOnly}
                            />
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={walletForm.control}
                      name={`locations.${index}.lat`}
                      render={({ field }) => (
                        <FormItem className="gap-1">
                          <FormLabel className={LABEL}>Latitud</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="-12.0464"
                              className={INPUT}
                              disabled={readOnly}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={walletForm.control}
                      name={`locations.${index}.lng`}
                      render={({ field }) => (
                        <FormItem className="gap-1">
                          <FormLabel className={LABEL}>Longitud</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="-77.0428"
                              className={INPUT}
                              disabled={readOnly}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={walletForm.control}
                    name={`locations.${index}.relevantText`}
                    render={({ field }) => (
                      <FormItem className="gap-1">
                        <FormLabel className={LABEL}>Texto en la pantalla de bloqueo</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Ej: Estamos cerca! Pasa por tu sello"
                            className={INPUT}
                            disabled={readOnly}
                          />
                        </FormControl>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Fecha relevante" />
          <div className="px-3 py-3 flex items-start justify-between gap-3 text-[12.5px]">
            <div className="min-w-0">
              <div className="text-ent-fg">Mostrar la última visita en la pantalla de bloqueo</div>
              <p className="text-[12px] text-ent-fg-3 mt-0.5">
                Cuando está activo, el pase muestra la fecha de la última visita en la pantalla de
                bloqueo del celular, recordándole al cliente que vuelva.
              </p>
            </div>
            <FormField
              control={walletForm.control}
              name="relevantDateEnabled"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={readOnly}
                      aria-label="Fecha relevante"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Panel>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isWalletPending || readOnly}
            title={readOnly ? "Solo lectura" : undefined}
            className="h-7 text-[12px] gap-1.5"
          >
            {isWalletPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {isWalletPending ? "Guardando..." : "Guardar pase y wallet"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
