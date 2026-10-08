"use client"

import type { SegmentFilter } from "@cuik/shared/types/campaign"
import { Loader2, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTenant } from "@/hooks/use-tenant"
import { formatDateTime } from "@/lib/format-date"

import { RecurringCampaignForm } from "./recurring-campaign-form"

export type RecurringCampaign = {
  id: string
  name: string
  type: "push" | "wallet_update"
  messages: string[]
  segment: SegmentFilter
  rule: {
    frequency: "weekly" | "monthly_weekday"
    intervalWeeks: number
    weekdays: number[]
    weekOfMonth: 1 | 2 | 3 | 4 | -1 | null
    sendHour: number
    sendMinute: number
    startsOn: string
    endsOn: string | null
    maxOccurrences: number | null
  }
  description: string
  skipIfVisitedDays: number | null
  minDaysSincePush: number | null
  status: "active" | "paused" | "finished"
  pausedReason: string | null
  nextRunAt: string | null
  lastRunAt: string | null
  occurrencesCount: number
  upcoming: string[]
  stats: { sends: number; totalTarget: number; totalSent: number; lastSentAt: string | null }
}

/** "todos los miércoles..." → "Todos los miércoles..." (CSS capitalize would title-case every word). */
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const STATUS: Record<RecurringCampaign["status"], { label: string; className: string }> = {
  active: {
    label: "Activa",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  paused: {
    label: "Pausada",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  finished: {
    label: "Terminada",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
}

function RecurringRow({
  row,
  timezone,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: RecurringCampaign
  timezone: string
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const st = STATUS[row.status]
  return (
    <li className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{row.name}</span>
          {row.pausedReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className={`${st.className} text-[10px] cursor-default`}>{st.label}</Badge>
              </TooltipTrigger>
              <TooltipContent>{row.pausedReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Badge className={`${st.className} text-[10px]`}>{st.label}</Badge>
          )}
          {row.messages.length > 1 && (
            <span className="text-[11px] text-muted-foreground">
              {row.messages.length} mensajes en rotación
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{capitalize(row.description)}</p>
        <p className="text-xs text-muted-foreground">
          {row.status === "active" && row.nextRunAt
            ? `Próximo envío: ${formatDateTime(row.nextRunAt, timezone)}`
            : row.status === "finished"
              ? "Completó todos sus envíos"
              : "En pausa, no se enviará hasta que la reanudes"}
          {row.stats.sends > 0 &&
            ` · ${row.stats.sends} ${row.stats.sends === 1 ? "envío" : "envíos"}, ${row.stats.totalSent} notificaciones`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {row.status !== "finished" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={busy}
                onClick={onToggle}
                aria-label={row.status === "active" ? "Pausar" : "Reanudar"}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : row.status === "active" ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{row.status === "active" ? "Pausar" : "Reanudar"}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onEdit}
              aria-label="Editar"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-600 hover:text-red-700"
              onClick={onDelete}
              aria-label="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Eliminar</TooltipContent>
        </Tooltip>
      </div>
    </li>
  )
}

/**
 * "Campañas recurrentes": templates that send themselves on a calendar
 * ("todos los miércoles a las 10"). Each send shows up in the campaign list
 * below like any other campaign.
 */
export function RecurringCampaignsCard({
  tenantSlug,
  onSent,
}: {
  tenantSlug: string
  onSent?: () => void
}) {
  const { timezone } = useTenant()
  const [rows, setRows] = useState<RecurringCampaign[] | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringCampaign | null>(null)
  const [deleting, setDeleting] = useState<RecurringCampaign | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/recurring-campaigns`)
      const json = await res.json()
      setRows(json.success ? json.data : [])
    } catch {
      setRows([])
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(row: RecurringCampaign) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/${tenantSlug}/recurring-campaigns/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: row.status === "active" ? "paused" : "active" }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      toast.success(row.status === "active" ? "Campaña pausada" : "Campaña reanudada")
      await load()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo cambiar el estado")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(row: RecurringCampaign) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/${tenantSlug}/recurring-campaigns/${row.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      toast.success("Campaña recurrente eliminada. Los envíos pasados quedan en el historial.")
      await load()
    } catch {
      toast.error("No se pudo eliminar")
    } finally {
      setBusyId(null)
      setDeleting(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Repeat className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Campañas recurrentes</CardTitle>
            <CardDescription>
              Se envían solas en el día y hora que definas: todos los miércoles, cada 2 jueves, el
              primer viernes del mes. La audiencia se recalcula en cada envío.
            </CardDescription>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-primary text-white gap-1.5 shrink-0"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva recurrente</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Todavía no tienes campañas recurrentes. Una típica: "Miércoles de 2x1" a tus clientes en
            riesgo, todos los miércoles a las 10:00.
          </p>
        ) : (
          <TooltipProvider>
            <ul className="divide-y">
              {rows.map((row) => (
                <RecurringRow
                  key={row.id}
                  row={row}
                  timezone={timezone}
                  busy={busyId === row.id}
                  onToggle={() => toggle(row)}
                  onEdit={() => {
                    setEditing(row)
                    setFormOpen(true)
                  }}
                  onDelete={() => setDeleting(row)}
                />
              ))}
            </ul>
          </TooltipProvider>
        )}
      </CardContent>

      <RecurringCampaignForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tenantSlug={tenantSlug}
        editing={editing}
        onSaved={() => {
          load()
          onSent?.()
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de enviarse. Los envíos que ya se hicieron se quedan en el historial de
              campañas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleting && remove(deleting)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
