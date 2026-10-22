"use client"

import { type BonusWindow, bonusWindowSchema, minutesOfClock } from "@cuik/shared/validators"
import { Clock, Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { saveBonusWindows } from "../actions"

type Props = {
  initialWindows: BonusWindow[]
  promotionType: "stamps" | "points"
  timezone: string
  canEdit: boolean
}

// Monday-first for the toggle row; values are JS weekdays (0 = Sunday).
const WEEKDAYS = [
  { value: 1, short: "L", label: "lunes" },
  { value: 2, short: "M", label: "martes" },
  { value: 3, short: "X", label: "miércoles" },
  { value: 4, short: "J", label: "jueves" },
  { value: 5, short: "V", label: "viernes" },
  { value: 6, short: "S", label: "sábado" },
  { value: 0, short: "D", label: "domingo" },
]
// Same caps as BONUS_MAX_MULTIPLIER: stamps up to x3, points up to x10.
const MULTIPLIERS = { stamps: [2, 3], points: [2, 3, 4, 5, 10] } as const
const p2 = (n: number) => String(n).padStart(2, "0")
// Every half hour; "24:00" closes the day.
const TIMES = Array.from(
  { length: 49 },
  (_, i) => `${p2(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`,
)

function timeLabel(t: string) {
  if (t === "24:00") return "fin del día"
  const [h, m] = t.split(":").map(Number)
  const suffix = h < 12 ? "a. m." : "p. m."
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${p2(m)} ${suffix}`
}

function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function describeWhen(w: BonusWindow) {
  const days =
    w.kind === "weekly"
      ? WEEKDAYS.filter((d) => w.days.includes(d.value))
          .map((d) => d.label)
          .join(", ")
      : w.date
        ? dateLabel(w.date)
        : ""
  const hours =
    w.start === "00:00" && w.end === "24:00"
      ? "todo el día"
      : `de ${timeLabel(w.start)} a ${timeLabel(w.end)}`
  return `${w.kind === "weekly" ? "Cada " : ""}${days}, ${hours}`
}

function nowClock(timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  )
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday)
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function isLiveNow(w: BonusWindow, clock: ReturnType<typeof nowClock>) {
  if (!w.active) return false
  const onDay = w.kind === "weekly" ? w.days.includes(clock.weekday) : w.date === clock.date
  return onDay && clock.minutes >= minutesOfClock(w.start) && clock.minutes < minutesOfClock(w.end)
}

/** A date window whose day already went by never applies again. */
function isPast(w: BonusWindow, clock: ReturnType<typeof nowClock>) {
  return w.kind === "date" && !!w.date && w.date < clock.date
}

function emptyWindow(timezone: string): BonusWindow {
  return {
    // randomUUID only exists in secure contexts (https / localhost).
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    label: "",
    kind: "weekly",
    days: [1],
    date: nowClock(timezone).date,
    start: "08:00",
    end: "12:00",
    multiplier: 2,
    active: true,
  }
}

export function HorasEspecialesClient({ initialWindows, promotionType, timezone, canEdit }: Props) {
  const [windows, setWindows] = useState<BonusWindow[]>(initialWindows)
  const [editing, setEditing] = useState<BonusWindow | null>(null)
  const [saving, setSaving] = useState(false)
  // Read the clock only in the browser so server and client render the same.
  const [clock, setClock] = useState<ReturnType<typeof nowClock> | null>(null)
  const unit = promotionType === "points" ? "puntos" : "sellos"

  useEffect(() => {
    setClock(nowClock(timezone))
    const id = setInterval(() => setClock(nowClock(timezone)), 60_000)
    return () => clearInterval(id)
  }, [timezone])

  async function persist(next: BonusWindow[], okMessage: string) {
    setSaving(true)
    const result = await saveBonusWindows(next)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return false
    }
    setWindows(result.data)
    toast.success(okMessage)
    return true
  }

  async function saveEditing() {
    if (!editing) return
    const candidate = { ...editing, label: editing.label.trim() }
    const parsed = bonusWindowSchema.safeParse(
      candidate.kind === "weekly" ? { ...candidate, date: null } : { ...candidate, days: [] },
    )
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Revisa los datos")
      return
    }
    const exists = windows.some((w) => w.id === parsed.data.id)
    const next = exists
      ? windows.map((w) => (w.id === parsed.data.id ? parsed.data : w))
      : [...windows, parsed.data]
    if (await persist(next, exists ? "Hora especial actualizada" : "Hora especial creada")) {
      setEditing(null)
    }
  }

  const live = clock ? windows.find((w) => isLiveNow(w, clock)) : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Horas especiales</h1>
            <p className="text-sm text-muted-foreground">
              Días y horas en que cada visita suma el doble o el triple de {unit}.
            </p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => setEditing(emptyWindow(timezone))} disabled={windows.length >= 20}>
            <Plus className="w-4 h-4 mr-1" /> Nueva hora especial
          </Button>
        )}
      </div>

      {live && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Activa ahora:</strong> cada visita suma ×{live.multiplier} {unit}
          {live.label ? ` (${live.label})` : ""}.
        </div>
      )}

      {windows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <p>Todavía no tienes horas especiales.</p>
            <p>
              Ejemplo: «Lunes de mañana», cada lunes de 8:00 a. m. a 12:00 p. m., ×2 {unit}. Úsalas
              para llenar las horas flojas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {windows.map((w) => {
            const now = clock ? isLiveNow(w, clock) : false
            const past = clock ? isPast(w, clock) : false
            return (
              <Card key={w.id} className={!w.active || past ? "opacity-60" : undefined}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-700">
                        ×{w.multiplier}
                      </span>
                      {w.label || `${w.multiplier === 2 ? "Doble" : `×${w.multiplier}`} de ${unit}`}
                      {now && <Badge className="bg-emerald-600">Activa ahora</Badge>}
                      {past && <Badge variant="secondary">Ya pasó</Badge>}
                      {!w.active && <Badge variant="secondary">Pausada</Badge>}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1.5 first-letter:uppercase">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      {describeWhen(w)}
                    </CardDescription>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={w.active}
                        disabled={saving}
                        aria-label={w.active ? "Pausar" : "Activar"}
                        onCheckedChange={(active) =>
                          persist(
                            windows.map((x) => (x.id === w.id ? { ...x, active } : x)),
                            active ? "Hora especial activada" : "Hora especial pausada",
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() =>
                          setEditing({ ...w, date: w.date ?? nowClock(timezone).date })
                        }
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        disabled={saving}
                        onClick={() =>
                          persist(
                            windows.filter((x) => x.id !== w.id),
                            "Hora especial eliminada",
                          )
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Se aplica con la hora de tu local ({timezone}). Si dos horas especiales coinciden, vale la
        más alta. El cajero ve el bono al escanear. Para avisar a tus clientes, crea un envío en
        Campañas.
      </p>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {windows.some((w) => w.id === editing.id) ? "Editar" : "Nueva"} hora especial
              </DialogTitle>
              <DialogDescription>En este horario cada visita suma más {unit}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bw-label">Nombre (opcional)</Label>
                <Input
                  id="bw-label"
                  maxLength={60}
                  placeholder="Ej: Lunes de mañana"
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>¿Cuántas veces?</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={String(editing.multiplier)}
                  onValueChange={(v) => v && setEditing({ ...editing, multiplier: Number(v) })}
                  className="justify-start"
                >
                  {MULTIPLIERS[promotionType].map((m) => (
                    <ToggleGroupItem key={m} value={String(m)} className="px-4">
                      ×{m}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="space-y-1.5">
                <Label>¿Cuándo?</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={editing.kind}
                  onValueChange={(v) =>
                    v && setEditing({ ...editing, kind: v as BonusWindow["kind"] })
                  }
                  className="justify-start"
                >
                  <ToggleGroupItem value="weekly" className="px-3">
                    Cada semana
                  </ToggleGroupItem>
                  <ToggleGroupItem value="date" className="px-3">
                    Una fecha
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {editing.kind === "weekly" ? (
                <div className="space-y-1.5">
                  <Label>Días</Label>
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={editing.days.map(String)}
                    onValueChange={(v) => setEditing({ ...editing, days: v.map(Number) })}
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
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="bw-date">Fecha</Label>
                  <Input
                    id="bw-date"
                    type="date"
                    value={editing.date ?? ""}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value || null })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Desde</Label>
                  <Select
                    value={editing.start}
                    onValueChange={(start) => setEditing({ ...editing, start })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMES.slice(0, -1).map((t) => (
                        <SelectItem key={t} value={t}>
                          {timeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Hasta</Label>
                  <Select
                    value={editing.end}
                    onValueChange={(end) => setEditing({ ...editing, end })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMES.slice(1).map((t) => (
                        <SelectItem key={t} value={t}>
                          {timeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={saveEditing} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
