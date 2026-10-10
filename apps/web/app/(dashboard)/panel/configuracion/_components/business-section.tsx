"use client"

import { BUSINESS_TYPES } from "@cuik/shared/constants"
import type { TenantConfigInput } from "@cuik/shared/validators"
import { tenantConfigSchema } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Save } from "lucide-react"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import {
  type ChipTone,
  FieldList,
  Notice,
  Panel,
  PanelHeader,
  StatusChip,
} from "@/components/admin/enterprise"
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
import { useTenant } from "@/hooks/use-tenant"

import type { TenantConfigData } from "../actions"
import { saveTenantConfig } from "../actions"

// ── Tenant status wording ───────────────────────────────────────────

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  active: { label: "Activo", tone: "ok" },
  trial: { label: "Prueba", tone: "info" },
  pending: { label: "Pendiente", tone: "warn" },
  expired: { label: "Expirado", tone: "mute" },
  paused: { label: "Pausado", tone: "mute" },
  cancelled: { label: "Cancelado", tone: "bad" },
}

const LABEL = "text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 font-normal"
const INPUT = "h-7 text-[12.5px]"

/**
 * Negocio: name, type, address and contact of the merchant, plus the plan
 * (read-only, managed by Cuik). Same action and schema as before.
 */
export function BusinessSection({ initialData }: { initialData: TenantConfigData }) {
  const { readOnly } = useTenant()
  const [isPending, startTransition] = useTransition()

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

  const status = STATUS[initialData.status] ?? { label: initialData.status, tone: "mute" as const }

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader title="Información del negocio" />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="px-3 py-3 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="gap-1">
                      <FormLabel className={LABEL}>Nombre del negocio</FormLabel>
                      <FormControl>
                        <Input {...field} className={INPUT} disabled={readOnly} />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="businessType"
                  render={({ field }) => (
                    <FormItem className="gap-1">
                      <FormLabel className={LABEL}>Tipo de negocio</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={readOnly}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full h-7 text-[12.5px]" size="sm">
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
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="gap-1">
                    <FormLabel className={LABEL}>Dirección</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Av. Ejemplo 1234, Ciudad"
                        className={INPUT}
                        disabled={readOnly}
                      />
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              <div className="grid sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="gap-1">
                      <FormLabel className={LABEL}>Teléfono</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="+51 987 654 321"
                          className={INPUT}
                          disabled={readOnly}
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem className="gap-1">
                      <FormLabel className={LABEL}>Correo de contacto</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="info@negocio.com"
                          className={INPUT}
                          disabled={readOnly}
                        />
                      </FormControl>
                      <FormMessage className="text-[11px]" />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end px-3 py-2 border-t border-ent-line">
              <Button
                type="submit"
                size="sm"
                disabled={isPending || readOnly}
                title={readOnly ? "Solo lectura" : undefined}
                className="h-7 text-[12px] gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Form>
      </Panel>

      <Panel>
        <PanelHeader title="Plan actual" />
        <div className="px-3">
          <FieldList
            rows={[
              { label: "Plan", value: initialData.planName ?? "Sin plan asignado" },
              {
                label: "Estado",
                value: <StatusChip tone={status.tone}>{status.label}</StatusChip>,
              },
              {
                label: "Identificador",
                value: <code className="font-mono">{initialData.slug}</code>,
              },
            ]}
          />
        </div>
        <div className="px-3 pb-3">
          <Notice tone="info">
            Tu plan es gestionado por el equipo de Cuik. Para cambios, contáctanos.
          </Notice>
        </div>
      </Panel>
    </div>
  )
}
