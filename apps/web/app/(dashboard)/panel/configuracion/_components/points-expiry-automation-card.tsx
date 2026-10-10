"use client"

import { Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Notice, Panel, PanelHeader } from "@/components/admin/enterprise"
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

type Data = {
  config: { enabled: boolean; message: string; daysBefore: number; sendHour: number }
  /** Human label of the expiration rule set by Cuik; null = points never expire. */
  policy: string | null
  expiringSoon: number
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const DAYS = [1, 2, 3, 5, 7]
const MAX = 150

function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`
}

/**
 * "Puntos por vencer" automation. Shown only when the tenant's points
 * program has an expiration rule (set by the Cuik team). The merchant owns
 * the text, how many days before and the hour. Sending happens in the
 * loyalty-expiration cron; each send shows up in the campaign history.
 */
export function PointsExpiryAutomationCard({ tenantSlug }: { tenantSlug: string }) {
  const { readOnly } = useTenant()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState("")
  const [daysBefore, setDaysBefore] = useState(2)
  const [sendHour, setSendHour] = useState(10)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`)
      const json = await res.json()
      if (!json.success) throw new Error()
      const d: Data | undefined = json.data.pointsExpiry
      if (!d) throw new Error()
      setData(d)
      setEnabled(d.config.enabled)
      setMessage(d.config.message)
      setDaysBefore(d.config.daysBefore)
      setSendHour(d.config.sendHour)
    } catch {
      // Silent: the panel is optional and the rest of the page works without it.
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  // Hidden while loading, on error, and for programs without expiration.
  if (loading || !data || !data.policy) return null

  const dirty =
    enabled !== data.config.enabled ||
    message !== data.config.message ||
    daysBefore !== data.config.daysBefore ||
    sendHour !== data.config.sendHour

  async function save() {
    if (!message.trim()) {
      toast.error("Escribe el mensaje del aviso")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pointsExpiry: { enabled, message: message.trim(), daysBefore, sendHour },
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(enabled ? "Aviso de vencimiento activado" : "Cambios guardados")
      await load()
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const when = daysBefore === 1 ? "mañana" : `en los próximos ${daysBefore} días`
  const expiringText =
    data.expiringSoon === 0
      ? `Ningún cliente tiene puntos que venzan ${when}.`
      : `${
          data.expiringSoon === 1
            ? "1 cliente tiene puntos que vencen"
            : `${data.expiringSoon} clientes tienen puntos que vencen`
        } ${when}.`

  return (
    <Panel>
      <PanelHeader
        title="Puntos por vencer"
        actions={
          <span className="flex items-center gap-2 text-[12px] text-ent-fg-2">
            {enabled ? "Activado" : "Desactivado"}
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={readOnly}
              aria-label="Activar aviso de puntos por vencer"
            />
          </span>
        }
      />
      <div className="p-3 space-y-3 text-[12.5px]">
        <p className="text-ent-fg-3 text-[12px]">
          Push automático a cada cliente unos días antes de que sus puntos venzan.
        </p>

        <Notice tone="info">
          <span className="font-medium">Regla de tu programa:</span> {data.policy}. Para cambiarla,
          escríbenos.
        </Notice>

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
              Usa <code className="font-mono">{"{{points.expiresAt}}"}</code> para la fecha de
              vencimiento.
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
          <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">Enviar</span>
          <Select
            value={String(daysBefore)}
            onValueChange={(v) => setDaysBefore(Number(v))}
            disabled={readOnly}
          >
            <SelectTrigger size="sm" className="w-32 h-7 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d === 1 ? "1 día antes" : `${d} días antes`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">a las</span>
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

        <p className="text-[11.5px] text-ent-fg-3">{expiringText}</p>
      </div>
    </Panel>
  )
}
