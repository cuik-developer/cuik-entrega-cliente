"use client"

import { ChevronLeft, ChevronRight, Eye, Loader2, Send } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { CampaignDetailDialog } from "./campaign-detail-dialog"

type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled"

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
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; className: string }> = {
  draft: {
    label: "Borrador",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  scheduled: {
    label: "Programada",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  sending: {
    label: "Enviando",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  sent: {
    label: "Enviada",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  cancelled: {
    label: "Cancelada",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
}

function getEffectivenessColor(rate: number): string {
  if (rate >= 10) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
  if (rate >= 5) return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
  return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
}

function EffectivenessBadge({ effectiveness }: { effectiveness: CampaignEffectiveness }) {
  const color = getEffectivenessColor(effectiveness.conversionRate)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${color} text-[10px] cursor-default`}>
            {effectiveness.conversions}/{effectiveness.totalSent} ({effectiveness.conversionRate}%)
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {effectiveness.conversions} de {effectiveness.totalSent} clientes visitaron dentro de{" "}
            {effectiveness.windowHours}h
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function getStatusDotColor(status: CampaignStatus): string {
  switch (status) {
    case "sent":
      return "bg-emerald-500"
    case "sending":
      return "bg-amber-500"
    case "scheduled":
      return "bg-blue-500"
    case "cancelled":
      return "bg-red-500"
    default:
      return "bg-slate-400"
  }
}

function MobileCampaignCard({
  campaign,
  sendingId,
  onSend,
  formatDate,
}: {
  campaign: CampaignRow
  sendingId: string | null
  onSend: (id: string) => void
  formatDate: (d: string | null) => string
}) {
  const statusConf = STATUS_CONFIG[campaign.status]
  const canSend = campaign.status === "draft" || campaign.status === "scheduled"

  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotColor(campaign.status)}`}
        />
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{campaign.name}</div>
          <div className="text-xs text-muted-foreground">
            {campaign.type === "push" ? "Push" : "Wallet"} · {formatDate(campaign.createdAt)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <div className="text-sm font-bold">
            {campaign.sentCount ?? 0}/{campaign.targetCount ?? 0}
          </div>
          <Badge className={`${statusConf.className} text-[10px]`}>{statusConf.label}</Badge>
          {campaign.effectiveness && (
            <div className="mt-1">
              <EffectivenessBadge effectiveness={campaign.effectiveness} />
            </div>
          )}
        </div>
        {canSend && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-primary"
            onClick={() => onSend(campaign.id)}
            disabled={sendingId === campaign.id}
          >
            {sendingId === campaign.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

export function CampaignList({ tenantSlug, refreshKey: _refreshKey }: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [pagination, setPagination] = useState<PaginationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [detailCampaign, setDetailCampaign] = useState<CampaignRow | null>(null)

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" })
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      const res = await fetch(`/api/${tenantSlug}/campaigns?${params.toString()}`)
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? "Error al cargar campanas")
        return
      }

      setCampaigns(json.data.data)
      setPagination(json.data.pagination)
    } catch {
      toast.error("Error de conexion")
    } finally {
      setIsLoading(false)
    }
  }, [tenantSlug, page, statusFilter])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  async function handleSend(campaignId: string) {
    setSendingId(campaignId)
    try {
      const res = await fetch(`/api/${tenantSlug}/campaigns/${campaignId}/send`, {
        method: "POST",
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? "Error al enviar campana")
        return
      }

      toast.success("Campana enviada exitosamente")
      fetchCampaigns()
    } catch {
      toast.error("Error de conexion")
    } finally {
      setSendingId(null)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-foreground">Historial de campanas</CardTitle>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[140px]" size="sm">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="scheduled">Programada</SelectItem>
              <SelectItem value="sending">Enviando</SelectItem>
              <SelectItem value="sent">Enviada</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No hay campanas todavia.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea tu primera campana para empezar.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Enviados / Total</TableHead>
                    <TableHead>Efectividad</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const statusConf = STATUS_CONFIG[c.status]
                    const canSend = c.status === "draft" || c.status === "scheduled"

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge className={statusConf.className}>{statusConf.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.type === "push" ? "Push" : "Wallet Update"}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-semibold">{c.sentCount ?? 0}</span>
                          <span className="text-muted-foreground text-xs">
                            {" / "}
                            {c.targetCount ?? 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.effectiveness ? (
                            <EffectivenessBadge effectiveness={c.effectiveness} />
                          ) : c.status === "sent" ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(c.sentAt ?? c.scheduledAt ?? c.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => setDetailCampaign(c)}
                              type="button"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {canSend && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-primary hover:text-primary"
                                onClick={() => handleSend(c.id)}
                                disabled={sendingId === c.id}
                              >
                                {sendingId === c.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {campaigns.map((c) => (
                <MobileCampaignCard
                  key={c.id}
                  campaign={c}
                  sendingId={sendingId}
                  onSend={handleSend}
                  formatDate={formatDate}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">
                  Pagina {pagination.page} de {pagination.totalPages} ({pagination.total} campanas)
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <CampaignDetailDialog
        open={detailCampaign !== null}
        onOpenChange={(open) => {
          if (!open) setDetailCampaign(null)
        }}
        campaign={detailCampaign}
        tenantSlug={tenantSlug}
      />
    </Card>
  )
}
