"use client"

import { Cake, Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { VariableInsertButton } from "./variable-insert-button"

type Person = { id: string; name: string; lastName: string | null }
type Upcoming = Person & { date: string; daysUntil: number }

type Data = {
  config: { enabled: boolean; message: string; sendHour: number }
  coverage: { withBirthday: number; total: number }
  today: Person[]
  upcoming: Upcoming[]
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MAX = 150

function fullName(p: Person) {
  return [p.name, p.lastName].filter(Boolean).join(" ")
}

function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`
}

/**
 * Birthday greeting automation. The card is the whole configuration: on/off,
 * message and hour. Sending happens in the campaigns-birthday cron; each day's
 * send shows up in the campaign history like any other push.
 */
export function BirthdayAutomationCard({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState("")
  const [sendHour, setSendHour] = useState(10)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`)
      const json = await res.json()
      if (!json.success) throw new Error()
      const b: Data = json.data.birthday
      setData(b)
      setEnabled(b.config.enabled)
      setMessage(b.config.message)
      setSendHour(b.config.sendHour)
    } catch {
      toast.error("No se pudo cargar la automatización de cumpleaños")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  const dirty =
    data !== null &&
    (enabled !== data.config.enabled ||
      message !== data.config.message ||
      sendHour !== data.config.sendHour)

  async function save() {
    if (!message.trim()) {
      toast.error("Escribí el mensaje del saludo")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthday: { enabled, message: message.trim(), sendHour } }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(enabled ? "Saludo de cumpleaños activado" : "Cambios guardados")
      await load()
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="border-pink-200 bg-pink-50/50 dark:border-pink-900 dark:bg-pink-950/20">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  if (!data) return null

  const pct =
    data.coverage.total > 0
      ? Math.round((data.coverage.withBirthday / data.coverage.total) * 100)
      : 0

  return (
    <Card className="border-pink-200 bg-pink-50/50 dark:border-pink-900 dark:bg-pink-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
              <Cake className="w-5 h-5 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <CardTitle className="text-base">Saludo de cumpleaños</CardTitle>
              <CardDescription>
                Push automático a cada cliente el día de su cumpleaños, a la hora que elijas.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              {enabled ? "Activado" : "Desactivado"}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Activar saludo de cumpleaños"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Mensaje</span>
            <VariableInsertButton textareaRef={textareaRef} onInsert={setMessage} />
          </div>
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            rows={2}
            className="bg-white dark:bg-background"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Usá <code className="font-mono">{"{{client.name}}"}</code> para el nombre del cliente.
            </span>
            <span
              className={
                message.length >= MAX
                  ? "text-red-500"
                  : message.length > 130
                    ? "text-orange-500"
                    : "text-muted-foreground"
              }
            >
              {message.length}/{MAX}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Hora de envío</span>
          <Select value={String(sendHour)} onValueChange={(v) => setSendHour(Number(v))}>
            <SelectTrigger size="sm" className="w-28 bg-white dark:bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">hora local del comercio</span>
          <Button size="sm" className="ml-auto gap-1.5" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar
          </Button>
        </div>

        <div className="rounded-lg border border-pink-200/70 dark:border-pink-900/60 bg-white/70 dark:bg-background/40 p-3 text-xs space-y-1.5">
          <p>
            <span className="font-medium text-foreground">Hoy cumplen años:</span>{" "}
            {data.today.length === 0 ? (
              <span className="text-muted-foreground">nadie</span>
            ) : (
              data.today.map(fullName).join(", ")
            )}
          </p>
          <p>
            <span className="font-medium text-foreground">Próximos 7 días:</span>{" "}
            {data.upcoming.length === 0 ? (
              <span className="text-muted-foreground">nadie</span>
            ) : (
              data.upcoming
                .slice(0, 6)
                .map(
                  (u) =>
                    `${fullName(u)} (${u.daysUntil === 1 ? "mañana" : `en ${u.daysUntil} días`})`,
                )
                .join(", ") + (data.upcoming.length > 6 ? ` y ${data.upcoming.length - 6} más` : "")
            )}
          </p>
          <p
            className={pct < 50 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}
          >
            {data.coverage.withBirthday} de {data.coverage.total} clientes tienen cumpleaños cargado
            ({pct}%).
            {pct < 50 && " Podés cargarlo desde la ficha de cada cliente."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
