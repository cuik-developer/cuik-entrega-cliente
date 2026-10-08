"use client"

import type { SegmentFilter } from "@cuik/shared/types"
import type { CreateCampaignInput } from "@cuik/shared/validators"
import { createCampaignSchema } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Bell, Clock, Loader2, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Textarea } from "@/components/ui/textarea"
import { useTenant } from "@/hooks/use-tenant"
import { formatDateTime } from "@/lib/format-date"
import { utcToWallTime, wallTimeToUtc } from "@/lib/zoned-time"
import { SegmentPicker } from "./segment-picker"
import { VariableInsertButton } from "./variable-insert-button"

interface CreateCampaignFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  onSuccess?: () => void
  /** Id of a draft / scheduled campaign to edit. Undefined = create. */
  editId?: string | null
}

const EMPTY_VALUES: CreateCampaignInput = {
  name: "",
  message: "",
  type: "push",
  segment: { preset: "todos" },
  scheduledAt: undefined,
}

export function CreateCampaignForm({
  open,
  onOpenChange,
  tenantSlug,
  onSuccess,
  editId,
}: CreateCampaignFormProps) {
  const isEdit = Boolean(editId)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [isScheduled, setIsScheduled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  // The picker keeps the wall time the admin typed ("2026-09-28T04:17"); the
  // UTC instant is derived from it in the TENANT timezone (not the browser's)
  // and only that instant travels to the server. Feeding the UTC ISO back into
  // the input is what used to show 09:17 for a 04:17 choice (and compounded
  // +5h on every edit).
  const { timezone } = useTenant()
  const [scheduledLocal, setScheduledLocal] = useState("")
  // Bumped when an edit finished loading: remounts the audience picker so its
  // tab is computed from the loaded value, not from the previous campaign.
  const [loadKey, setLoadKey] = useState(0)

  const form = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: EMPTY_VALUES,
  })

  // Edit mode: load the campaign when the dialog opens with an id. Create
  // mode: start clean every time it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form is stable (react-hook-form ref)
  useEffect(() => {
    if (!open) return
    if (!editId) {
      form.reset(EMPTY_VALUES)
      setIsScheduled(false)
      setScheduledLocal("")
      return
    }
    let cancelled = false
    setLoadingEdit(true)
    fetch(`/api/${tenantSlug}/campaigns/${editId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.success) throw new Error()
        const c = json.data as {
          name: string
          type: "push" | "wallet_update"
          message: string | null
          scheduledAt: string | null
          segment: { filter: SegmentFilter } | null
        }
        form.reset({
          name: c.name,
          type: c.type,
          message: c.message ?? "",
          segment: c.segment?.filter ?? { preset: "todos" },
          scheduledAt: c.scheduledAt ?? undefined,
        })
        setIsScheduled(Boolean(c.scheduledAt))
        setScheduledLocal(c.scheduledAt ? utcToWallTime(c.scheduledAt, timezone) : "")
        setLoadKey((k) => k + 1)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("No se pudo cargar la campaña")
          onOpenChange(false)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, editId, tenantSlug, timezone])

  async function onSubmit(data: CreateCampaignInput) {
    setIsSubmitting(true)
    try {
      const res = await fetch(
        isEdit ? `/api/${tenantSlug}/campaigns/${editId}` : `/api/${tenantSlug}/campaigns`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // On edit, an unscheduled campaign sends null so a previous schedule is removed.
          body: JSON.stringify(isEdit ? { ...data, scheduledAt: data.scheduledAt ?? null } : data),
        },
      )

      const json = await res.json()

      if (!res.ok) {
        toast.error(
          json.error ?? (isEdit ? "Error al guardar la campaña" : "Error al crear la campaña"),
        )
        return
      }

      toast.success(isEdit ? "Campaña actualizada" : "Campaña creada exitosamente")
      form.reset(EMPTY_VALUES)
      setIsScheduled(false)
      setScheduledLocal("")
      onOpenChange(false)
      onSuccess?.()
    } catch {
      toast.error("Error de conexion. Intenta de nuevo.")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleSegmentChange(segment: SegmentFilter) {
    form.setValue("segment", segment, { shouldValidate: true })
  }

  function handleScheduleToggle(checked: boolean) {
    setIsScheduled(checked)
    if (!checked) {
      setScheduledLocal("")
      form.setValue("scheduledAt", undefined, { shouldValidate: true })
    }
  }

  function handleScheduledLocalChange(local: string) {
    setScheduledLocal(local)
    const instant = wallTimeToUtc(local, timezone)
    form.setValue("scheduledAt", instant ? instant.toISOString() : undefined, {
      shouldValidate: true,
    })
  }

  const scheduledIso = form.watch("scheduledAt")
  // Earliest pickable value: now, in the tenant timezone.
  const minLocal = utcToWallTime(new Date(), timezone)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            {isEdit ? "Editar campaña" : "Nueva campaña"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Puedes cambiar todo mientras la campaña no se haya enviado."
              : "Envia mensajes segmentados a tus clientes via Wallet."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la campaña</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Promo fin de semana" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de campaña</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="push">
                        <div className="flex items-center gap-2">
                          <Bell className="w-3.5 h-3.5" />
                          Push Notification
                        </div>
                      </SelectItem>
                      <SelectItem value="wallet_update">
                        <div className="flex items-center gap-2">
                          <Send className="w-3.5 h-3.5" />
                          Wallet Update
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {field.value === "wallet_update"
                      ? "Actualiza silenciosamente los pases de todos los clientes seleccionados"
                      : "Envia una notificacion visible al cliente con tu mensaje"}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Message */}
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => {
                const charCount = field.value?.length ?? 0
                return (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Mensaje</FormLabel>
                      <VariableInsertButton
                        textareaRef={messageRef}
                        onInsert={(newValue) => field.onChange(newValue)}
                      />
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Ej: Hola {{client.name}}! Te esperamos este viernes con 2x1."
                        rows={3}
                        {...field}
                        ref={(el) => {
                          field.ref(el)
                          messageRef.current = el
                        }}
                      />
                    </FormControl>
                    <div className="flex items-center justify-between">
                      <FormMessage />
                      <span
                        className={`text-xs ml-auto ${
                          charCount >= 150
                            ? "text-red-500 font-semibold"
                            : charCount > 130
                              ? "text-orange-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {charCount}/150
                      </span>
                    </div>
                  </FormItem>
                )
              }}
            />

            {/* Segment */}
            <FormField
              control={form.control}
              name="segment"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SegmentPicker
                      key={`${editId ?? "new"}-${loadKey}`}
                      value={field.value}
                      onChange={handleSegmentChange}
                      tenantSlug={tenantSlug}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Schedule toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Programar envio</span>
                </div>
                <Switch checked={isScheduled} onCheckedChange={handleScheduleToggle} />
              </div>

              {isScheduled && (
                <FormField
                  control={form.control}
                  name="scheduledAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha y hora de envio</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          min={minLocal}
                          value={scheduledLocal}
                          onChange={(e) => handleScheduledLocalChange(e.target.value)}
                          onBlur={field.onBlur}
                          name={field.name}
                        />
                      </FormControl>
                      {scheduledIso && (
                        <p className="text-xs text-muted-foreground">
                          Se enviará el {formatDateTime(scheduledIso, timezone)} (hora del comercio,{" "}
                          {timezone.replace("_", " ")})
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting || loadingEdit}
                className="bg-primary text-white gap-2 flex-1"
              >
                {isSubmitting || loadingEdit ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isEdit ? "Guardar cambios" : isScheduled ? "Programar" : "Crear campaña"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
