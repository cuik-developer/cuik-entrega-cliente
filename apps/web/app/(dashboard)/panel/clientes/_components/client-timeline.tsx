"use client"

import {
  Award,
  Ban,
  CircleCheck,
  Gift,
  GiftIcon,
  Loader2,
  Megaphone,
  Stamp,
  StickyNote,
  UserPlus,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useTenant } from "@/hooks/use-tenant"
import { formatDateTime } from "@/lib/format-date"

type TimelineEvent = {
  id: string
  type:
    | "visit"
    | "reward_earned"
    | "reward_redeemed"
    | "reward_expired"
    | "note"
    | "status_change"
    | "campaign"
    | "registered"
  at: string
  title: string
  detail?: string
  by?: string
}

type Filter = "all" | "visits" | "rewards" | "notes" | "campaigns"

const FILTERS: Array<{ v: Filter; label: string }> = [
  { v: "all", label: "Todo" },
  { v: "visits", label: "Visitas" },
  { v: "rewards", label: "Premios" },
  { v: "notes", label: "Notas" },
  { v: "campaigns", label: "Campañas" },
]

const FILTER_TYPES: Record<Filter, TimelineEvent["type"][] | null> = {
  all: null,
  visits: ["visit", "registered"],
  rewards: ["reward_earned", "reward_redeemed", "reward_expired"],
  notes: ["note", "status_change"],
  campaigns: ["campaign"],
}

const STYLE: Record<TimelineEvent["type"], { icon: typeof Stamp; tone: string }> = {
  visit: { icon: Stamp, tone: "bg-blue-50 text-primary" },
  reward_earned: { icon: Gift, tone: "bg-amber-50 text-amber-600" },
  reward_redeemed: { icon: Award, tone: "bg-emerald-50 text-emerald-600" },
  reward_expired: { icon: GiftIcon, tone: "bg-red-50 text-red-500" },
  note: { icon: StickyNote, tone: "bg-slate-100 text-slate-500" },
  status_change: { icon: Ban, tone: "bg-red-50 text-red-500" },
  campaign: { icon: Megaphone, tone: "bg-violet-50 text-violet-600" },
  registered: { icon: UserPlus, tone: "bg-sky-50 text-sky-600" },
}

// "vence 2026-09-16T00:00:00.000Z" inside a detail string → formatted date.
function formatDetail(detail: string | undefined, tz: string): string | undefined {
  if (!detail) return undefined
  return detail.replace(/vence (\S+)/, (_m, iso: string) => `vence ${formatDateTime(iso, tz)}`)
}

type Props = { clientId: string; tenantSlug: string }

export function ClientTimeline({ clientId, tenantSlug }: Props) {
  const { timezone } = useTenant()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/timeline?limit=200`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "error")
      setEvents(json.data ?? [])
    } catch {
      setError("No se pudo cargar la actividad.")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, clientId])

  useEffect(() => {
    load()
  }, [load])

  const allowed = FILTER_TYPES[filter]
  const visible = allowed ? events.filter((e) => allowed.includes(e.type)) : events

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.v}
            size="sm"
            variant={filter === f.v ? "default" : "outline"}
            className={filter === f.v ? "bg-primary text-white" : ""}
            onClick={() => setFilter(f.v)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card className="border border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-between gap-3 p-4 text-sm text-red-600">
              {error}
              <Button size="sm" variant="outline" onClick={load}>
                Reintentar
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Sin actividad {filter === "all" ? "todavía" : "en esta categoría"}.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {visible.map((e) => {
                const s =
                  e.type === "status_change" && e.title.includes("desbloqueado")
                    ? { icon: CircleCheck, tone: "bg-emerald-50 text-emerald-600" }
                    : STYLE[e.type]
                return (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.tone}`}
                    >
                      <s.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium text-foreground">{e.title}</span>
                        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDateTime(e.at, timezone)}
                        </span>
                      </div>
                      {(e.detail || e.by) && (
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                          {formatDetail(e.detail, timezone)}
                          {e.detail && e.by ? " · " : ""}
                          {e.by ? `por ${e.by}` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
