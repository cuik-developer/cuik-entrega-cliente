"use client"

import { Loader2, Mail, Save, Send } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
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

type Weekly = { enabled: boolean; dayOfWeek: number; sendHour: number; lastSentPeriod?: string }
type Monthly = { enabled: boolean; dayOfMonth: number; sendHour: number; lastSentPeriod?: string }
type Data = {
  config: { weekly: Weekly; monthly: Monthly }
  recipients: string[]
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

function hourLabel(h: number) {
  return `${String(h).padStart(2, "0")}:00`
}

/**
 * Weekly and monthly reports by email. One card, two rows: each with its
 * switch, day, hour and a "send me a test" button. Sending happens in the
 * reports cron; the test goes only to the signed-in admin and never counts
 * as the scheduled send.
 */
export function ReportsAutomationCard({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<"weekly" | "monthly" | null>(null)
  const [weekly, setWeekly] = useState<Weekly>({ enabled: false, dayOfWeek: 1, sendHour: 8 })
  const [monthly, setMonthly] = useState<Monthly>({ enabled: false, dayOfMonth: 1, sendHour: 8 })

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`)
      const json = await res.json()
      if (!json.success) throw new Error()
      const r: Data = json.data.reports
      setData(r)
      setWeekly(r.config.weekly)
      setMonthly(r.config.monthly)
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
      monthly.sendHour !== data.config.monthly.sendHour)

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
      <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  if (!data) return null

  return (
    <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <CardTitle className="text-base">Reportes por correo</CardTitle>
            <CardDescription>
              Un resumen de tu negocio con Excel adjunto: visitas, clientes nuevos, premios,
              clientes en riesgo y cumpleaños. Sin datos de contacto.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weekly */}
        <div className="rounded-xl border border-sky-200/70 dark:border-sky-900 bg-white dark:bg-background p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-sm">Reporte semanal</div>
              <div className="text-xs text-muted-foreground">
                La semana cerrada (lunes a domingo) comparada con la anterior.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                {weekly.enabled ? "Activado" : "Desactivado"}
              </span>
              <Switch
                checked={weekly.enabled}
                onCheckedChange={(v) => setWeekly({ ...weekly, enabled: v })}
                aria-label="Activar reporte semanal"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Enviar los</span>
            <Select
              value={String(weekly.dayOfWeek)}
              onValueChange={(v) => setWeekly({ ...weekly, dayOfWeek: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-32">
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
            <span className="text-xs font-medium text-muted-foreground">a las</span>
            <Select
              value={String(weekly.sendHour)}
              onValueChange={(v) => setWeekly({ ...weekly, sendHour: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-24">
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
              variant="outline"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() => sendTest("weekly")}
              disabled={testing !== null}
            >
              {testing === "weekly" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Enviarme una prueba
            </Button>
          </div>
        </div>

        {/* Monthly */}
        <div className="rounded-xl border border-sky-200/70 dark:border-sky-900 bg-white dark:bg-background p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-sm">Reporte mensual</div>
              <div className="text-xs text-muted-foreground">
                El mes cerrado comparado con el anterior, más tu historia desde que empezaste.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                {monthly.enabled ? "Activado" : "Desactivado"}
              </span>
              <Switch
                checked={monthly.enabled}
                onCheckedChange={(v) => setMonthly({ ...monthly, enabled: v })}
                aria-label="Activar reporte mensual"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Enviar el día</span>
            <Select
              value={String(monthly.dayOfMonth)}
              onValueChange={(v) => setMonthly({ ...monthly, dayOfMonth: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-20">
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
            <span className="text-xs font-medium text-muted-foreground">de cada mes a las</span>
            <Select
              value={String(monthly.sendHour)}
              onValueChange={(v) => setMonthly({ ...monthly, sendHour: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-24">
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
              variant="outline"
              size="sm"
              className="ml-auto gap-1.5"
              onClick={() => sendTest("monthly")}
              disabled={testing !== null}
            >
              {testing === "monthly" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Enviarme una prueba
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            Llega a:{" "}
            <span className="font-medium text-foreground">{data.recipients.join(", ") || "—"}</span>
            {" · "}hora local del comercio. La prueba va solo a {data.myEmail ?? "tu correo"}.
          </span>
          <Button size="sm" className="ml-auto gap-1.5" onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
