"use client"

import { Loader2, Plus, Save, Send, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Panel, PanelHeader, PanelMessage } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useTenant } from "@/hooks/use-tenant"

type Weekly = { enabled: boolean; dayOfWeek: number; sendHour: number; lastSentPeriod?: string }
type Monthly = { enabled: boolean; dayOfMonth: number; sendHour: number; lastSentPeriod?: string }
type Data = {
  config: { weekly: Weekly; monthly: Monthly; recipients: string[] }
  /** Default list (contact email + owner + admins), used when recipients is empty. */
  suggested: string[]
  myEmail: string | null
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const DAYS = Array.from({ length: 28 }, (_, d) => d + 1)
const WEEKDAYS = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [7, "Domingo"],
] as const
const MAX_RECIPIENTS = 10

function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

const LABEL = "text-[11px] uppercase tracking-[0.05em] text-ent-fg-3"

/**
 * Weekly and monthly reports by email (Configuración → Reportes por correo).
 * Each report has its switch, day, hour and a "send me a test" button; below,
 * who receives them: pick from the suggested addresses (contact email, owner,
 * admins) or type any email. Sending happens in the reports cron; the test
 * goes only to the signed-in admin and never counts as the scheduled send.
 * Same logic as the card in Analítica; this is the settings-page rendering.
 */
export function ReportsSection({ tenantSlug }: { tenantSlug: string }) {
  const { readOnly } = useTenant()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<"weekly" | "monthly" | null>(null)
  const [weekly, setWeekly] = useState<Weekly>({ enabled: false, dayOfWeek: 1, sendHour: 8 })
  const [monthly, setMonthly] = useState<Monthly>({ enabled: false, dayOfMonth: 1, sendHour: 8 })
  const [recipients, setRecipients] = useState<string[]>([])
  const [draft, setDraft] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`)
      const json = await res.json()
      if (!json.success) throw new Error()
      const r: Data = json.data.reports
      setData(r)
      setWeekly(r.config.weekly)
      setMonthly(r.config.monthly)
      setRecipients(r.config.recipients)
    } catch {
      toast.error("No se pudieron cargar los reportes por correo")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  const dirty =
    data !== null &&
    (weekly.enabled !== data.config.weekly.enabled ||
      weekly.dayOfWeek !== data.config.weekly.dayOfWeek ||
      weekly.sendHour !== data.config.weekly.sendHour ||
      monthly.enabled !== data.config.monthly.enabled ||
      monthly.dayOfMonth !== data.config.monthly.dayOfMonth ||
      monthly.sendHour !== data.config.monthly.sendHour ||
      !sameList(recipients, data.config.recipients))

  function addRecipient(raw: string) {
    const email = raw.trim().toLowerCase()
    if (!email) return
    if (!isEmail(email)) {
      toast.error("Escribí un correo válido")
      return
    }
    if (recipients.includes(email)) {
      setDraft("")
      return
    }
    if (recipients.length >= MAX_RECIPIENTS) {
      toast.error(`Máximo ${MAX_RECIPIENTS} correos`)
      return
    }
    setRecipients([...recipients, email])
    setDraft("")
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reports: {
            weekly: {
              enabled: weekly.enabled,
              dayOfWeek: weekly.dayOfWeek,
              sendHour: weekly.sendHour,
            },
            monthly: {
              enabled: monthly.enabled,
              dayOfMonth: monthly.dayOfMonth,
              sendHour: monthly.sendHour,
            },
            recipients,
          },
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success("Reportes por correo guardados")
      await load()
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  async function sendTest(kind: "weekly" | "monthly") {
    setTesting(kind)
    try {
      const res = await fetch(`/api/${tenantSlug}/reports/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(`Prueba enviada a ${json.data.to.join(", ")}`)
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo enviar la prueba")
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <Panel>
        <PanelHeader title="Reportes por correo" />
        <PanelMessage className="py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      </Panel>
    )
  }
  if (!data) return null

  const suggestedLeft = data.suggested.filter((e) => !recipients.includes(e))
  const usingDefault = recipients.length === 0

  const testButton = (kind: "weekly" | "monthly") => (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto h-7 text-[12px] gap-1.5"
      onClick={() => sendTest(kind)}
      disabled={testing !== null || readOnly}
      title={readOnly ? "Solo lectura" : undefined}
    >
      {testing === kind ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Send className="w-3.5 h-3.5" />
      )}
      Enviarme una prueba
    </Button>
  )

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader
          title="Reportes por correo"
          actions={
            <Button
              size="sm"
              className="h-6 text-[12px] gap-1"
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
          }
        />
        <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-b border-ent-line">
          Un resumen de tu negocio con Excel adjunto: visitas, clientes nuevos, premios, clientes en
          riesgo y cumpleaños. Sin datos de contacto. Hora local del comercio; la prueba va solo a{" "}
          {data.myEmail ?? "tu correo"}.
        </p>

        {/* Weekly */}
        <div className="px-3 py-3 border-b border-ent-line space-y-2 text-[12.5px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-ent-fg">Reporte semanal</div>
              <div className="text-[12px] text-ent-fg-3">
                La semana cerrada (lunes a domingo) comparada con la anterior.
              </div>
            </div>
            <span className="flex items-center gap-2 text-[12px] text-ent-fg-2 shrink-0">
              {weekly.enabled ? "Activado" : "Desactivado"}
              <Switch
                checked={weekly.enabled}
                onCheckedChange={(v) => setWeekly({ ...weekly, enabled: v })}
                disabled={readOnly}
                aria-label="Activar reporte semanal"
              />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>Enviar los</span>
            <Select
              value={String(weekly.dayOfWeek)}
              onValueChange={(v) => setWeekly({ ...weekly, dayOfWeek: Number(v) })}
              disabled={readOnly}
            >
              <SelectTrigger size="sm" className="w-28 h-7 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map(([d, label]) => (
                  <SelectItem key={d} value={String(d)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className={LABEL}>a las</span>
            <Select
              value={String(weekly.sendHour)}
              onValueChange={(v) => setWeekly({ ...weekly, sendHour: Number(v) })}
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
            {testButton("weekly")}
          </div>
        </div>

        {/* Monthly */}
        <div className="px-3 py-3 border-b border-ent-line space-y-2 text-[12.5px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-ent-fg">Reporte mensual</div>
              <div className="text-[12px] text-ent-fg-3">
                El mes cerrado comparado con el anterior, más tu historia desde que empezaste.
              </div>
            </div>
            <span className="flex items-center gap-2 text-[12px] text-ent-fg-2 shrink-0">
              {monthly.enabled ? "Activado" : "Desactivado"}
              <Switch
                checked={monthly.enabled}
                onCheckedChange={(v) => setMonthly({ ...monthly, enabled: v })}
                disabled={readOnly}
                aria-label="Activar reporte mensual"
              />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>Enviar el día</span>
            <Select
              value={String(monthly.dayOfMonth)}
              onValueChange={(v) => setMonthly({ ...monthly, dayOfMonth: Number(v) })}
              disabled={readOnly}
            >
              <SelectTrigger size="sm" className="w-20 h-7 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className={LABEL}>de cada mes a las</span>
            <Select
              value={String(monthly.sendHour)}
              onValueChange={(v) => setMonthly({ ...monthly, sendHour: Number(v) })}
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
            {testButton("monthly")}
          </div>
        </div>

        {/* Recipients */}
        <div className="px-3 py-3 space-y-2 text-[12.5px]">
          <div>
            <div className="font-semibold text-ent-fg">A quién le llegan</div>
            <div className="text-[12px] text-ent-fg-3">
              {usingDefault
                ? "Sin lista propia: van al correo de contacto del comercio y a los administradores. Agregá correos para elegir vos."
                : "Solo a esta lista. Si la vaciás, vuelven al correo de contacto y los administradores."}
            </div>
          </div>

          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-[4px] border border-ent-line bg-ent-panel-2 text-[12px]"
                >
                  {e}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setRecipients(recipients.filter((x) => x !== e))}
                      aria-label={`Quitar ${e}`}
                      className="w-4 h-4 rounded-[3px] hover:bg-ent-line flex items-center justify-center text-ent-fg-2"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {suggestedLeft.length > 0 && !readOnly && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-ent-fg-3">Sugeridos:</span>
              {suggestedLeft.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => addRecipient(e)}
                  className="inline-flex items-center gap-1 px-2 h-6 rounded-[4px] border border-dashed border-ent-line-strong text-ent-accent hover:bg-ent-accent-soft"
                >
                  <Plus className="w-3 h-3" />
                  {e}
                </button>
              ))}
            </div>
          )}

          {!readOnly && (
            <form
              className="flex items-center gap-2"
              onSubmit={(ev) => {
                ev.preventDefault()
                addRecipient(draft)
              }}
            >
              <Input
                type="email"
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                placeholder="otro@correo.com"
                className="h-7 text-[12.5px] max-w-xs"
                aria-label="Agregar correo"
              />
              <Button type="submit" variant="outline" size="sm" className="h-7 text-[12px] gap-1">
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </Button>
              <span className="text-[11.5px] text-ent-fg-3 ml-auto tabular-nums">
                {recipients.length}/{MAX_RECIPIENTS}
              </span>
            </form>
          )}
        </div>
      </Panel>
    </div>
  )
}
