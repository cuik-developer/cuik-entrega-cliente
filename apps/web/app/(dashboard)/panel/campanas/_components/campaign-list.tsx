"use client"

import { Eye, Loader2, Pencil, Send, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  Panel,
  PanelFooter,
  PanelMessage,
  type Stat,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_TONE,
  CAMPAIGN_TYPE_LABEL,
  type CampaignStatus,
  type CampaignType,
} from "@/lib/admin/campaign-labels"
import { formatDateTime } from "@/lib/format-date"

import { CampaignDetailDialog } from "./campaign-detail-dialog"

interface CampaignEffectiveness {
  campaignId: string
  totalSent: number
  conversions: number
  conversionRate: number
  windowHours: number
}

interface CampaignRow {
  id: string
  name: string
  type: string
  status: CampaignStatus
  message: string
  scheduledAt: string | null
  sentAt: string | null
  targetCount: number | null
  sentCount: number | null
  deliveredCount: number | null
  /** Clients in the segment with no pass installed (not reachable). */
  skippedNoPass?: number
  createdAt: string
  effectiveness: CampaignEffectiveness | null
}

interface PaginationData {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface CampaignListProps {
  tenantSlug: string
  refreshKey?: number
  /** Opens the campaign form in edit mode (drafts and scheduled only). Undefined = read-only. */
  onEdit?: (campaignId: string) => void
}

const STATUS_OPTIONS: [string, string][] = [
  ["all", "Estado: todas"],
  ["draft", "Borradores"],
  ["scheduled", "Programadas"],
  ["sending", "Enviando"],
  ["sent", "Enviadas"],
  ["cancelled", "Canceladas"],
]

/** Origin filter; an option is offered only when the tenant has campaigns of that kind. */
const KIND_OPTIONS: [string, string][] = [
  ["manual", "Regulares"],
  ["scheduled", "Programadas"],
  ["birthday", "Cumpleaños"],
  ["recurring", "Recurrentes"],
  ["points_expiring", "Puntos por vencer"],
  ["churn", "Recuperación (en riesgo)"],
  ["silent", "Actualización silenciosa"],
]

/** Totals for the strip: one `limit=1` request per status, the pagination meta carries the count. */
type Totals = { all: number; sent: number; scheduled: number; draft: number }

function typeLabel(t: string): string {
  return CAMPAIGN_TYPE_LABEL[t as CampaignType] ?? t
}

function Effectiveness({ e }: { e: CampaignEffectiveness | null }) {
  if (!e) return <span className="text-ent-fg-3">—</span>
  const tone = e.conversionRate >= 10 ? "ok" : e.conversionRate >= 5 ? "warn" : "bad"
  return (
    <StatusChip
      tone={tone}
      title={`${e.conversions} de ${e.totalSent} clientes visitaron dentro de ${e.windowHours} h`}
    >
      {e.conversions} · {e.conversionRate}%
    </StatusChip>
  )
}

export function CampaignList({ tenantSlug, refreshKey, onEdit }: CampaignListProps) {
  const { timezone, readOnly } = useTenant()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [pagination, setPagination] = useState<PaginationData | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [kinds, setKinds] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [detailCampaign, setDetailCampaign] = useState<CampaignRow | null>(null)

  // Only the newest request may update the list (filters can change mid-flight).
  const reqSeq = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey re-reads the list after a write
  const fetchCampaigns = useCallback(async () => {
    const seq = ++reqSeq.current
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" })
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }
      if (kindFilter !== "all") {
        params.set("kind", kindFilter)
      }

      const res = await fetch(`/api/${tenantSlug}/campaigns?${params.toString()}`)
      const json = await res.json()
      if (seq !== reqSeq.current) return

      if (!res.ok) {
        toast.error(json.error ?? "Error al cargar campañas")
        return
      }

      // Deleting the last row of page N>1 would strand the admin on an empty
      // page with no pagination controls: step back and refetch.
      if (json.data.data.length === 0 && page > 1 && json.data.pagination?.total > 0) {
        setPage((p) => Math.max(1, p - 1))
        return
      }
      setCampaigns(json.data.data)
      setPagination(json.data.pagination)
      if (json.data.kinds) setKinds(json.data.kinds)
    } catch {
      if (seq === reqSeq.current) toast.error("Error de conexion")
    } finally {
      if (seq === reqSeq.current) setIsLoading(false)
    }
  }, [tenantSlug, page, statusFilter, kindFilter, refreshKey])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // Strip figures: independent of the filter, refreshed with the list.
  const fetchTotals = useCallback(async () => {
    const count = async (status?: string) => {
      const params = new URLSearchParams({ page: "1", limit: "1" })
      if (status) params.set("status", status)
      const res = await fetch(`/api/${tenantSlug}/campaigns?${params.toString()}`)
      const json = await res.json().catch(() => null)
      return res.ok ? Number(json?.data?.pagination?.total ?? 0) : 0
    }
    try {
      const [all, sent, scheduled, draft] = await Promise.all([
        count(),
        count("sent"),
        count("scheduled"),
        count("draft"),
      ])
      setTotals({ all, sent, scheduled, draft })
    } catch {
      setTotals(null)
    }
  }, [tenantSlug])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey re-reads the totals after a write
  useEffect(() => {
    fetchTotals()
  }, [fetchTotals, refreshKey])

  function refreshAll() {
    fetchCampaigns()
    fetchTotals()
  }

  async function handleSend(campaignId: string) {
    setSendingId(campaignId)
    try {
      const res = await fetch(`/api/${tenantSlug}/campaigns/${campaignId}/send`, {
        method: "POST",
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? "Error al enviar campaña")
        return
      }

      toast.success("Campaña enviada exitosamente")
      refreshAll()
    } catch {
      toast.error("Error de conexion")
    } finally {
      setSendingId(null)
    }
  }

  async function handleDelete(campaignId: string) {
    const target = campaigns.find((c) => c.id === campaignId)
    if (
      !window.confirm(
        `¿Eliminar la campaña "${target?.name ?? ""}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    try {
      const res = await fetch(`/api/${tenantSlug}/campaigns/${campaignId}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Error al eliminar la campaña")
        return
      }
      toast.success("Campaña eliminada")
      refreshAll()
    } catch {
      toast.error("Error de conexion")
    }
  }

  const formatDate = (dateStr: string | null) => formatDateTime(dateStr, timezone)

  /** "Enviada", "Programada" or created date, whichever applies. */
  function whenOf(c: CampaignRow): string {
    if (c.sentAt) return formatDate(c.sentAt)
    if (c.status === "scheduled" && c.scheduledAt) return `Prog. ${formatDate(c.scheduledAt)}`
    return formatDate(c.createdAt)
  }

  const sentOnPage = campaigns.filter((c) => c.effectiveness)
  const avgRate =
    sentOnPage.length > 0
      ? Math.round(
          sentOnPage.reduce((acc, c) => acc + (c.effectiveness?.conversionRate ?? 0), 0) /
            sentOnPage.length,
        )
      : null

  const stats: Stat[] = [
    { label: "Campañas", value: totals ? totals.all : "…" },
    { label: "Enviadas", value: totals ? totals.sent : "…" },
    {
      label: "Programadas",
      value: totals ? totals.scheduled : "…",
      hint: totals && totals.draft > 0 ? `${totals.draft} borr.` : undefined,
      tone: "mute",
    },
    {
      label: "Respuesta promedio",
      value: avgRate === null ? "—" : `${avgRate}%`,
      hint: avgRate === null ? undefined : "en esta página",
      tone: "mute",
    },
  ]

  const select =
    "h-[26px] px-2 pr-6 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent cursor-pointer"

  const canWrite = !readOnly

  return (
    <>
      <StatStrip stats={stats} />

      <Panel>
        <Toolbar>
          <select
            value={statusFilter}
            aria-label="Filtrar por estado"
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className={select}
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={kindFilter}
            aria-label="Filtrar por tipo"
            onChange={(e) => {
              setKindFilter(e.target.value)
              setPage(1)
            }}
            className={select}
          >
            <option value="all">Tipo: todos</option>
            {KIND_OPTIONS.filter(([v]) => v === kindFilter || (kinds[v] ?? 0) > 0).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11.5px] text-ent-fg-3 tabular-nums">
            {isLoading ? "…" : pagination ? `${pagination.total} campañas` : ""}
          </span>
        </Toolbar>

        {isLoading && campaigns.length === 0 ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando campañas…
          </PanelMessage>
        ) : campaigns.length === 0 ? (
          <PanelMessage>
            <span>
              {statusFilter === "all"
                ? "No hay campañas todavía."
                : "No hay campañas con ese estado."}
            </span>
            {statusFilter === "all" && <span>Crea tu primera campaña para empezar.</span>}
          </PanelMessage>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <Th>Campaña</Th>
                  <Th>Estado</Th>
                  <Th>Tipo</Th>
                  <Th>Fecha</Th>
                  <Th align="right">Destinatarios</Th>
                  <Th align="right">Enviados</Th>
                  <Th>Respondieron</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const canSend = c.status === "draft" || c.status === "scheduled"
                  const sending = sendingId === c.id
                  return (
                    <Tr key={c.id} className="cursor-pointer" onClick={() => setDetailCampaign(c)}>
                      <Td className="whitespace-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailCampaign(c)
                          }}
                          className="font-medium text-ent-fg hover:text-ent-accent hover:underline text-left"
                        >
                          {c.name}
                        </button>
                        {c.message && (
                          <div className="text-[11px] text-ent-fg-3 leading-tight truncate max-w-[320px]">
                            {c.message}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <StatusChip tone={CAMPAIGN_STATUS_TONE[c.status] ?? "mute"}>
                          {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                        </StatusChip>
                      </Td>
                      <Td>{typeLabel(c.type)}</Td>
                      <Td className="text-ent-fg-2">{whenOf(c)}</Td>
                      <Td align="right">{c.targetCount ?? 0}</Td>
                      <Td align="right">
                        {c.sentCount ?? 0}
                        {(c.skippedNoPass ?? 0) > 0 && (
                          <span className="text-ent-fg-3 text-[11px]">
                            {" "}
                            · {c.skippedNoPass} sin pase
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Effectiveness e={c.effectiveness} />
                      </Td>
                      <Td align="right">
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: swallows the row click so the buttons act alone */}
                        <div
                          className="flex items-center justify-end gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-ent-fg-2"
                            onClick={() => setDetailCampaign(c)}
                            type="button"
                            aria-label="Ver detalle"
                            title="Ver detalle"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {canSend && canWrite && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-ent-accent hover:text-ent-accent"
                              onClick={() => handleSend(c.id)}
                              disabled={sending}
                              type="button"
                              aria-label="Enviar ahora"
                              title="Enviar ahora"
                            >
                              {sending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          )}
                          {canSend && canWrite && onEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-ent-fg-2"
                              onClick={() => onEdit(c.id)}
                              type="button"
                              aria-label="Editar campaña"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canSend && canWrite && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-ent-bad hover:text-ent-bad"
                              onClick={() => handleDelete(c.id)}
                              type="button"
                              aria-label="Eliminar campaña"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DataTable>

            {pagination && pagination.totalPages > 1 && (
              <PanelFooter>
                <span>
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total} campañas
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[12px]"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[12px]"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </PanelFooter>
            )}
          </>
        )}
      </Panel>

      <CampaignDetailDialog
        open={detailCampaign !== null}
        onOpenChange={(open) => {
          if (!open) setDetailCampaign(null)
        }}
        campaign={detailCampaign}
        tenantSlug={tenantSlug}
      />
    </>
  )
}
