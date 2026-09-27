"use client"

import { Hourglass, Loader2, Save } from "lucide-react"
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
      // Silent: the card is optional and the rest of Campañas works without it.
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

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Hourglass className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">Puntos por vencer</CardTitle>
              <CardDescription>
                Push automático a cada cliente unos días antes de que sus puntos venzan.
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
              aria-label="Activar aviso de puntos por vencer"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-200/70 dark:border-amber-900/60 bg-white/70 dark:bg-background/40 p-3 text-xs">
          <span className="font-medium text-foreground">Regla de tu programa:</span> {data.policy}.
          Para cambiarla, escríbenos.
        </div>

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
              Usa <code className="font-mono">{"{{points.expiresAt}}"}</code> para la fecha de
              vencimiento.
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
          <span className="text-xs font-medium text-muted-foreground">Enviar</span>
          <Select value={String(daysBefore)} onValueChange={(v) => setDaysBefore(Number(v))}>
            <SelectTrigger size="sm" className="w-36 bg-white dark:bg-background">
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
          <span className="text-xs font-medium text-muted-foreground">a las</span>
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
          <Button size="sm" className="ml-auto gap-1.5" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {data.expiringSoon === 0
            ? `Ningún cliente tiene puntos que venzan en los próximos ${daysBefore} días.`
            : `${data.expiringSoon} ${data.expiringSoon === 1 ? "cliente tiene" : "clientes tienen"} puntos que vencen en los próximos ${daysBefore} días.`}
        </p>
      </CardContent>
    </Card>
  )
}
