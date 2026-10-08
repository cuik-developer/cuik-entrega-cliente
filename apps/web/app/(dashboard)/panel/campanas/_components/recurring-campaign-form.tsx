"use client"

import type { SegmentFilter } from "@cuik/shared/types/campaign"
import {
  type CreateRecurringCampaignInput,
  createRecurringCampaignSchema,
} from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarClock, Loader2, Plus, Repeat, Trash2 } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTenant } from "@/hooks/use-tenant"
import { formatDateTime } from "@/lib/format-date"

import { capitalize, type RecurringCampaign } from "./recurring-campaigns-card"
import { SegmentPicker } from "./segment-picker"
import { VariableInsertButton } from "./variable-insert-button"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  /** Template being edited; null = create. */
  editing: RecurringCampaign | null
  onSaved: () => void
}

// Monday-first for the toggle row; values are JS weekdays (0 = Sunday).
const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: "L", label: "lunes" },
  { value: 2, short: "M", label: "martes" },
  { value: 3, short: "X", label: "miércoles" },
  { value: 4, short: "J", label: "jueves" },
  { value: 5, short: "V", label: "viernes" },
  { value: 6, short: "S", label: "sábado" },
  { value: 0, short: "D", label: "domingo" },
]
const WEEK_OF_MONTH = [
  { value: 1, label: "Primer" },
  { value: 2, label: "Segundo" },
  { value: 3, label: "Tercer" },
  { value: 4, label: "Cuarto" },
  { value: -1, label: "Último" },
]
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MINUTES = [0, 15, 30, 45]
const INTERVALS = [1, 2, 3, 4, 6, 8, 12]
const VISIT_GUARD = [
  { value: 0, label: "No omitir a nadie" },
  { value: 1, label: "Si vino hoy o ayer" },
  { value: 3, label: "Si vino en los últimos 3 días" },
  { value: 7, label: "Si vino en los últimos 7 días" },
  { value: 14, label: "Si vino en los últimos 14 días" },
  { value: 30, label: "Si vino en los últimos 30 días" },
]
const PUSH_GUARD = [
  { value: 0, label: "Sin límite" },
  { value: 1, label: "Máximo un aviso por día" },
  { value: 3, label: "Máximo un aviso cada 3 días" },
  { value: 7, label: "Máximo un aviso por semana" },
]
type EndMode = "never" | "date" | "count"

function todayLocal(timezone: string) {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone })
}

function emptyValues(timezone: string): CreateRecurringCampaignInput {
  return {
    name: "",
    type: "push",
    messages: [""],
    segment: { preset: "todos" },
    rule: {
      frequency: "weekly",
      intervalWeeks: 1,
      weekdays: [3],
      weekOfMonth: null,
      sendHour: 10,
      sendMinute: 0,
      startsOn: todayLocal(timezone),
      endsOn: null,
      maxOccurrences: null,
    },
    skipIfVisitedDays: null,
    minDaysSincePush: null,
  }
}

function valuesFrom(t: RecurringCampaign): CreateRecurringCampaignInput {
  return {
    name: t.name,
    type: t.type,
    messages: t.messages.length ? t.messages : [""],
    segment: t.segment,
    rule: {
      frequency: t.rule.frequency,
      intervalWeeks: t.rule.intervalWeeks,
      weekdays: t.rule.weekdays,
      weekOfMonth: t.rule.weekOfMonth ?? null,
      sendHour: t.rule.sendHour,
      sendMinute: t.rule.sendMinute,
      startsOn: t.rule.startsOn,
      endsOn: t.rule.endsOn ?? null,
      maxOccurrences: t.rule.maxOccurrences ?? null,
    },
    skipIfVisitedDays: t.skipIfVisitedDays ?? null,
    minDaysSincePush: t.minDaysSincePush ?? null,
  }
}

/** One message of the rotation, with its own variable inserter. */
function MessageField({
  value,
  onChange,
  onRemove,
  index,
  canRemove,
}: {
  value: string
  onChange: (v: string) => void
  onRemove: () => void
  index: number
  canRemove: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const count = value.length
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Mensaje {index + 1}</span>
        <div className="flex items-center gap-1">
          <VariableInsertButton textareaRef={ref} onInsert={onChange} />
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRemove}
              aria-label={`Quitar mensaje ${index + 1}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
      <Textarea
        ref={ref}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej: Hola {{client.name}}, hoy miércoles 2x1 en bebidas."
      />
      <div className="text-right">
        <span
          className={`text-xs ${count >= 150 ? "text-red-500 font-semibold" : count > 130 ? "text-orange-500" : "text-muted-foreground"}`}
        >
          {count}/150
        </span>
      </div>
    </div>
  )
}

export function RecurringCampaignForm({ open, onOpenChange, tenantSlug, editing, onSaved }: Props) {
  const { timezone } = useTenant()
  const [submitting, setSubmitting] = useState(false)
  const [endMode, setEndMode] = useState<EndMode>("never")
  const [preview, setPreview] = useState<{ description: string; next: string[] } | null>(null)

  const form = useForm<CreateRecurringCampaignInput>({
    resolver: zodResolver(createRecurringCampaignSchema),
    defaultValues: emptyValues(timezone),
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: form is stable (react-hook-form ref)
  useEffect(() => {
    if (!open) return
    const values = editing ? valuesFrom(editing) : emptyValues(timezone)
    form.reset(values)
    setEndMode(values.rule.endsOn ? "date" : values.rule.maxOccurrences ? "count" : "never")
    setPreview(null)
  }, [open, editing, timezone])

  const rule = form.watch("rule")
  const messages = form.watch("messages")
  const frequency = rule.frequency

  // Live preview of the next sends, debounced.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialized rule
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/${tenantSlug}/recurring-campaigns/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rule),
        })
        const json = await res.json()
        setPreview(json.success ? json.data : null)
      } catch {
        setPreview(null)
      }
    }, 350)
    return () => clearTimeout(handle)
  }, [JSON.stringify(rule), open, tenantSlug])

  function setRule<K extends keyof CreateRecurringCampaignInput["rule"]>(
    key: K,
    value: CreateRecurringCampaignInput["rule"][K],
  ) {
    form.setValue(
      "rule",
      { ...form.getValues("rule"), [key]: value },
      { shouldValidate: true, shouldDirty: true },
    )
  }

  function handleFrequency(next: "weekly" | "monthly_weekday") {
    setRule("frequency", next)
    if (next === "monthly_weekday") {
      setRule("weekdays", [rule.weekdays[0] ?? 5])
      setRule("weekOfMonth", rule.weekOfMonth ?? 1)
    } else {
      setRule("weekOfMonth", null)
    }
  }

  function handleEndMode(mode: EndMode) {
    setEndMode(mode)
    if (mode !== "date") setRule("endsOn", null)
    if (mode !== "count") setRule("maxOccurrences", null)
    if (mode === "count" && !rule.maxOccurrences) setRule("maxOccurrences", 4)
  }

  async function onSubmit(values: CreateRecurringCampaignInput) {
    setSubmitting(true)
    try {
      const url = editing
        ? `/api/${tenantSlug}/recurring-campaigns/${editing.id}`
        : `/api/${tenantSlug}/recurring-campaigns`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "No se pudo guardar la campaña recurrente")
        return
      }
      toast.success(editing ? "Campaña recurrente actualizada" : "Campaña recurrente creada")
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-primary" />
            {editing ? "Editar campaña recurrente" : "Nueva campaña recurrente"}
          </DialogTitle>
          <DialogDescription>
            Se envía sola según el calendario que definas. La audiencia se recalcula en cada envío.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () =>
              toast.error("Revisa los campos marcados antes de activar la campaña"),
            )}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Miércoles de 2x1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Messages in rotation */}
            <FormField
              control={form.control}
              name="messages"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Mensajes</FormLabel>
                    {field.value.length < 6 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => field.onChange([...field.value, ""])}
                      >
                        <Plus className="w-3.5 h-3.5" /> Otro mensaje
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {field.value.map((m, i) => (
                      <MessageField
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional rotation slots
                        key={i}
                        index={i}
                        value={m}
                        canRemove={field.value.length > 1}
                        onChange={(v) => {
                          const next = [...field.value]
                          next[i] = v
                          field.onChange(next)
                        }}
                        onRemove={() => field.onChange(field.value.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>
                  {messages.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Se alternan en orden: el primer envío usa el mensaje 1, el siguiente el 2, y
                      así.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Audience */}
            <FormField
              control={form.control}
              name="segment"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SegmentPicker
                      key={editing?.id ?? "new"}
                      value={field.value as SegmentFilter}
                      onChange={(s) => field.onChange(s)}
                      tenantSlug={tenantSlug}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Schedule */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="w-4 h-4 text-muted-foreground" /> Calendario
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium">Repetir</span>
                  <Select
                    value={frequency}
                    onValueChange={(v) => handleFrequency(v as typeof frequency)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Por semana</SelectItem>
                      <SelectItem value="monthly_weekday">Por mes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {frequency === "weekly" ? (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Cada</span>
                    <Select
                      value={String(rule.intervalWeeks)}
                      onValueChange={(v) => setRule("intervalWeeks", Number(v))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERVALS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n === 1 ? "Todas las semanas" : `${n} semanas`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Semana del mes</span>
                    <Select
                      value={String(rule.weekOfMonth ?? 1)}
                      onValueChange={(v) => setRule("weekOfMonth", Number(v) as 1 | 2 | 3 | 4 | -1)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_OF_MONTH.map((w) => (
                          <SelectItem key={w.value} value={String(w.value)}>
                            {w.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium">
                  {frequency === "weekly" ? "Días" : "Día de la semana"}
                </span>
                {frequency === "weekly" ? (
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={rule.weekdays.map(String)}
                    onValueChange={(v) => v.length > 0 && setRule("weekdays", v.map(Number))}
                    className="justify-start"
                  >
                    {WEEKDAYS.map((d) => (
                      <ToggleGroupItem
                        key={d.value}
                        value={String(d.value)}
                        aria-label={d.label}
                        className="w-9"
                      >
                        {d.short}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={String(rule.weekdays[0] ?? 5)}
                    onValueChange={(v) => v && setRule("weekdays", [Number(v)])}
                    className="justify-start"
                  >
                    {WEEKDAYS.map((d) => (
                      <ToggleGroupItem
                        key={d.value}
                        value={String(d.value)}
                        aria-label={d.label}
                        className="w-9"
                      >
                        {d.short}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                <FormMessage>{form.formState.errors.rule?.weekdays?.message}</FormMessage>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium">Hora</span>
                  <Select
                    value={String(rule.sendHour)}
                    onValueChange={(v) => setRule("sendHour", Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium">Minutos</span>
                  <Select
                    value={String(rule.sendMinute)}
                    onValueChange={(v) => setRule("sendMinute", Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTES.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {String(m).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium">Desde</span>
                  <Input
                    type="date"
                    value={rule.startsOn}
                    onChange={(e) => setRule("startsOn", e.target.value)}
                  />
                  <FormMessage>{form.formState.errors.rule?.startsOn?.message}</FormMessage>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium">Termina</span>
                  <Select value={endMode} onValueChange={(v) => handleEndMode(v as EndMode)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Nunca (hasta que la pauses)</SelectItem>
                      <SelectItem value="date">En una fecha</SelectItem>
                      <SelectItem value="count">Después de N envíos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {endMode === "date" && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Última fecha</span>
                    <Input
                      type="date"
                      min={rule.startsOn}
                      value={rule.endsOn ?? ""}
                      onChange={(e) => setRule("endsOn", e.target.value || null)}
                    />
                    <FormMessage>{form.formState.errors.rule?.endsOn?.message}</FormMessage>
                  </div>
                )}
                {endMode === "count" && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Cantidad de envíos</span>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={rule.maxOccurrences ?? ""}
                      onChange={(e) =>
                        setRule("maxOccurrences", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                    <FormMessage>{form.formState.errors.rule?.maxOccurrences?.message}</FormMessage>
                  </div>
                )}
              </div>

              <div className="rounded-md bg-muted/60 p-3 text-xs">
                {preview ? (
                  <>
                    <p className="font-medium">{capitalize(preview.description)}</p>
                    {preview.next.length > 0 ? (
                      <p className="text-muted-foreground mt-1">
                        Próximos envíos:{" "}
                        {preview.next.map((d) => formatDateTime(d, timezone)).join(" · ")}
                      </p>
                    ) : (
                      <p className="text-red-600 mt-1">
                        Con estas fechas no queda ningún envío por hacer.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Calculando próximos envíos…</p>
                )}
              </div>
            </div>

            {/* Guards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="skipIfVisitedDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Omitir a quien ya vino</FormLabel>
                    <Select
                      value={String(field.value ?? 0)}
                      onValueChange={(v) => field.onChange(Number(v) || null)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {VISIT_GUARD.map((o) => (
                          <SelectItem key={o.value} value={String(o.value)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minDaysSincePush"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Frecuencia máxima por cliente</FormLabel>
                    <Select
                      value={String(field.value ?? 0)}
                      onValueChange={(v) => field.onChange(Number(v) || null)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PUSH_GUARD.map((o) => (
                          <SelectItem key={o.value} value={String(o.value)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Cuenta cualquier aviso: campañas, cumpleaños y puntos por vencer.
                    </p>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary text-white gap-2" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? "Guardar cambios" : "Activar campaña"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
