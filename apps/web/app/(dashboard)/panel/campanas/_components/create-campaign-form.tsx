"use client"

import type { SegmentFilter } from "@cuik/shared/types"
import type { CreateCampaignInput } from "@cuik/shared/validators"
import { createCampaignSchema } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Bell, Clock, Loader2, Send } from "lucide-react"
import { useRef, useState } from "react"
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
import { SegmentPicker } from "./segment-picker"
import { VariableInsertButton } from "./variable-insert-button"

interface CreateCampaignFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  onSuccess?: () => void
}

export function CreateCampaignForm({
  open,
  onOpenChange,
  tenantSlug,
  onSuccess,
}: CreateCampaignFormProps) {
  const [isScheduled, setIsScheduled] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const messageRef = useRef<HTMLTextAreaElement | null>(null)

  const form = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      name: "",
      message: "",
      type: "push",
      segment: { preset: "todos" },
      scheduledAt: undefined,
    },
  })

  async function onSubmit(data: CreateCampaignInput) {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? "Error al crear la campana")
        return
      }

      toast.success("Campana creada exitosamente")
      form.reset()
      setIsScheduled(false)
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
      form.setValue("scheduledAt", undefined)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Nueva campana
          </DialogTitle>
          <DialogDescription>
            Envia mensajes segmentados a tus clientes via Wallet.
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
                  <FormLabel>Nombre de la campana</FormLabel>
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
                  <FormLabel>Tipo de campana</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                          value={field.value ? field.value.slice(0, 16) : ""}
                          onChange={(e) => {
                            const val = e.target.value
                            field.onChange(val ? new Date(val).toISOString() : undefined)
                          }}
                        />
                      </FormControl>
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
                disabled={isSubmitting}
                className="bg-primary text-white gap-2 flex-1"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isScheduled ? "Programar" : "Crear campana"}
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
