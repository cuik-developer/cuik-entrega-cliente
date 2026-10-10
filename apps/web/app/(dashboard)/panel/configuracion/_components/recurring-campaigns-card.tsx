"use client"

import type { SegmentFilter } from "@cuik/shared/types/campaign"
import { Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
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
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import { RECURRING_STATUS_LABEL, RECURRING_STATUS_TONE } from "@/lib/admin/campaign-labels"
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

function RecurringRow({
  row,
  busy,
  readOnly,
  next,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: RecurringCampaign
  busy: boolean
  readOnly: boolean
  next: string
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const toggleLabel = row.status === "active" ? "Pausar" : "Reanudar"
  return (
    <Tr>
      <Td className="whitespace-normal">
        <div className="font-medium text-ent-fg">{row.name}</div>
        {row.messages.length > 1 && (
          <div className="text-[11px] text-ent-fg-3 leading-tight">
            {row.messages.length} mensajes en rotación
          </div>
        )}
      </Td>
      <Td>
        <StatusChip tone={RECURRING_STATUS_TONE[row.status]} title={row.pausedReason ?? undefined}>
          {RECURRING_STATUS_LABEL[row.status]}
        </StatusChip>
      </Td>
      <Td className="whitespace-normal text-ent-fg-2 max-w-[280px]">
        {capitalize(row.description)}
      </Td>
      <Td className="text-ent-fg-2">{next}</Td>
      <Td align="right" className="text-ent-fg-2">
        {row.stats.sends > 0 ? (
          <span title={`${row.stats.totalSent} notificaciones`}>
            {row.stats.sends}
            <span className="text-ent-fg-3 text-[11px]"> · {row.stats.totalSent} notif.</span>
          </span>
        ) : (
          <span className="text-ent-fg-3">—</span>
        )}
      </Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-0.5">
          {row.status !== "finished" && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-ent-fg-2"
              disabled={busy}
              onClick={onToggle}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : row.status === "active" ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-ent-fg-2"
            onClick={onEdit}
            aria-label={readOnly ? "Ver" : "Editar"}
            title={readOnly ? "Ver" : "Editar"}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-ent-bad hover:text-ent-bad"
              onClick={onDelete}
              aria-label="Eliminar"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </Td>
    </Tr>
  )
}

/**
 * "Campañas recurrentes": templates that send themselves on a calendar
 * ("todos los miércoles a las 10"). Each send shows up in the Campañas list
 * like any other campaign.
 */
export function RecurringCampaignsCard({
  tenantSlug,
  onSent,
}: {
  tenantSlug: string
  onSent?: () => void
}) {
  const { timezone, readOnly } = useTenant()
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

  function nextOf(row: RecurringCampaign): string {
    if (row.status === "active" && row.nextRunAt) return formatDateTime(row.nextRunAt, timezone)
    if (row.status === "finished") return "Completó todos sus envíos"
    return "En pausa"
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <span>
            Campañas recurrentes
            {rows && rows.length > 0 && (
              <span className="font-normal text-ent-fg-3 tabular-nums"> {rows.length}</span>
            )}
          </span>
        }
        actions={
          <Button
            size="sm"
            className="h-6 text-[12px] gap-1"
            disabled={readOnly}
            title={readOnly ? "Solo lectura" : undefined}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva recurrente
          </Button>
        }
      />
      <p className="px-3 py-2 text-[12px] text-ent-fg-3 border-b border-ent-line">
        Se envían solas en el día y hora que definas: todos los miércoles, cada 2 jueves, el primer
        viernes del mes. La audiencia se recalcula en cada envío.
      </p>

      {rows === null ? (
        <PanelMessage className="py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
        </PanelMessage>
      ) : rows.length === 0 ? (
        <PanelMessage className="py-6">
          <span>Todavía no tienes campañas recurrentes.</span>
          <span>
            Una típica: "Miércoles de 2x1" a tus clientes en riesgo, todos los miércoles a las
            10:00.
          </span>
        </PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Campaña</Th>
              <Th>Estado</Th>
              <Th>Calendario</Th>
              <Th>Próximo envío</Th>
              <Th align="right">Envíos</Th>
              <Th align="right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RecurringRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                readOnly={readOnly}
                next={nextOf(row)}
                onToggle={() => toggle(row)}
                onEdit={() => {
                  setEditing(row)
                  setFormOpen(true)
                }}
                onDelete={() => setDeleting(row)}
              />
            ))}
          </tbody>
        </DataTable>
      )}

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
        <AlertDialogContent className="ent">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">
              ¿Eliminar "{deleting?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              Dejará de enviarse. Los envíos que ya se hicieron se quedan en el historial de
              campañas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-[12px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="h-7 text-[12px] bg-ent-bad hover:bg-ent-bad/90"
              onClick={() => deleting && remove(deleting)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}
