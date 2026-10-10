"use client"

import { Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { FieldList, Notice, Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
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

import { VariableInsertButton } from "../../campanas/_components/variable-insert-button"

type Person = { id: string; name: string; lastName: string | null }
type Upcoming = Person & { date: string; daysUntil: number }

type Data = {
  config: { enabled: boolean; message: string; sendHour: number }
  coverage: { withBirthday: number; total: number }
  today: Person[]
  upcoming: Upcoming[]
  /** Registration asks for the birthday (configured by the Cuik team). */
  asked?: boolean
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
 * Birthday greeting automation. The panel is the whole configuration: on/off,
 * message and hour. Sending happens in the campaigns-birthday cron; each day's
 * send shows up in the campaign history like any other push.
 */
export function BirthdayAutomationCard({ tenantSlug }: { tenantSlug: string }) {
  const { readOnly } = useTenant()
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
      <Panel>
        <PanelHeader title="Saludo de cumpleaños" />
        <PanelMessage className="py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      </Panel>
    )
  }
  if (!data) {
    return (
      <Panel>
        <PanelHeader title="Saludo de cumpleaños" />
        <PanelMessage className="py-6">
          <span>No se pudo cargar el saludo de cumpleaños.</span>
          <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={load}>
            Reintentar
          </Button>
        </PanelMessage>
      </Panel>
    )
  }

  const noBirthdays = data.coverage.withBirthday === 0
  // A tenant that neither asks for birthdays nor has any loaded (e.g. a
  // historical client base) never sees this panel: it only confuses the admin.
  if (noBirthdays && !data.asked && !data.config.enabled) return null
  const pct =
    data.coverage.total > 0
      ? Math.round((data.coverage.withBirthday / data.coverage.total) * 100)
      : 0

  const upcomingText =
    data.upcoming.length === 0
      ? "nadie"
      : data.upcoming
          .slice(0, 6)
          .map((u) => `${fullName(u)} (${u.daysUntil === 1 ? "mañana" : `en ${u.daysUntil} días`})`)
          .join(", ") + (data.upcoming.length > 6 ? ` y ${data.upcoming.length - 6} más` : "")

  return (
    <Panel>
      <PanelHeader
        title="Saludo de cumpleaños"
        actions={
          <span className="flex items-center gap-2 text-[12px] text-ent-fg-2">
            {enabled ? "Activado" : "Desactivado"}
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={readOnly}
              aria-label="Activar saludo de cumpleaños"
            />
          </span>
        }
      />
      <div className="p-3 space-y-3 text-[12.5px]">
        <p className="text-ent-fg-3 text-[12px]">
          Push automático a cada cliente el día de su cumpleaños, a la hora que elijas.
        </p>

        {noBirthdays && (
          <Notice tone="warn">
            {data.asked
              ? "Todavía ningún cliente tiene cumpleaños cargado. Los nuevos lo dejan al registrarse; para los actuales podés cargarlo desde su ficha. Mientras tanto el saludo no tiene a quién enviarse."
              : "Este comercio no pregunta el cumpleaños en el registro, así que el saludo automático no tiene a quién enviarse. Podés desactivarlo, o pedirle al equipo de Cuik que habilite la pregunta."}
          </Notice>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">Mensaje</span>
            {!readOnly && <VariableInsertButton textareaRef={textareaRef} onInsert={setMessage} />}
          </div>
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            rows={2}
            disabled={readOnly}
            className="text-[12.5px]"
          />
          <div className="flex items-center justify-between text-[11px] text-ent-fg-3">
            <span>
              Usá <code className="font-mono">{"{{client.name}}"}</code> para el nombre del cliente.
            </span>
            <span
              className={
                message.length >= MAX ? "text-ent-bad" : message.length > 130 ? "text-ent-warn" : ""
              }
            >
              {message.length}/{MAX}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">
            Hora de envío
          </span>
          <Select
            value={String(sendHour)}
            onValueChange={(v) => setSendHour(Number(v))}
            disabled={readOnly}
          >
            <SelectTrigger size="sm" className="w-24 h-7 text-[12.5px]">
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
          <span className="text-[11.5px] text-ent-fg-3">hora local del comercio</span>
          <Button
            size="sm"
            className="ml-auto h-7 text-[12px] gap-1.5"
            onClick={save}
            disabled={saving || !dirty || readOnly}
            title={readOnly ? "Solo lectura" : undefined}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar
          </Button>
        </div>

        <div className="border border-ent-line rounded-[4px] px-3">
          <FieldList
            rows={[
              {
                label: "Hoy cumplen años",
                value:
                  data.today.length === 0 ? (
                    <span className="text-ent-fg-3">nadie</span>
                  ) : (
                    data.today.map(fullName).join(", ")
                  ),
              },
              {
                label: "Próximos 7 días",
                value:
                  data.upcoming.length === 0 ? (
                    <span className="text-ent-fg-3">nadie</span>
                  ) : (
                    upcomingText
                  ),
              },
              {
                label: "Con cumpleaños",
                value: (
                  <span className={pct < 50 ? "text-ent-warn" : ""}>
                    {data.coverage.withBirthday} de {data.coverage.total} clientes ({pct}%)
                    {pct < 50 && ". Podés cargarlo desde la ficha de cada cliente."}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </div>
    </Panel>
  )
}
