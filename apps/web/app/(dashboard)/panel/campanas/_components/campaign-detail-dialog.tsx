"use client"

import { Download, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  FieldList,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTenant } from "@/hooks/use-tenant"
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_TONE,
  CAMPAIGN_TYPE_LABEL,
  type CampaignStatus,
  type CampaignType,
} from "@/lib/admin/campaign-labels"
import { formatDateTime } from "@/lib/format-date"

interface Recipient {
  clientId: string
  name: string
  phone: string | null
  email: string | null
  status: string
  sentAt: string | null
  visited: boolean
  visitedAt: string | null
}

interface CampaignInfo {
  id: string
  name: string
  type: string
  status: string
  message: string
  sentAt: string | null
  scheduledAt: string | null
  createdAt: string
  targetCount: number | null
  sentCount: number | null
  skippedNoPass?: number
}

interface CampaignDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: CampaignInfo | null
  tenantSlug: string
}

function generateCsv(_campaign: CampaignInfo, recipients: Recipient[], timezone: string): string {
  const BOM = "﻿"
  const headers = ["Nombre", "Telefono", "Email", "Estado notificacion", "Visito?", "Fecha visita"]
  const rows = recipients.map((r) => [
    r.name,
    r.phone ?? "",
    r.email ?? "",
    r.status,
    r.visited ? "Si" : "No",
    r.visitedAt ? formatDateTime(r.visitedAt, timezone) : "",
  ])

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n")

  return BOM + csvContent
}

function downloadCsv(campaign: CampaignInfo, recipients: Recipient[], timezone: string) {
  const csv = generateCsv(campaign, recipients, timezone)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `campaña-${campaign.name.replace(/\s+/g, "-").toLowerCase()}-detalle.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function CampaignDetailDialog({
  open,
  onOpenChange,
  campaign,
  tenantSlug,
}: CampaignDetailDialogProps) {
  const { timezone } = useTenant()
  const formatDate = (dateStr: string | null) => formatDateTime(dateStr, timezone)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchRecipients = useCallback(async () => {
    if (!campaign) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/campaigns/${campaign.id}/recipients`)
      const json = await res.json()
      if (res.ok && json.success) {
        setRecipients(json.data ?? [])
      } else {
        toast.error("Error al cargar destinatarios")
      }
    } catch {
      toast.error("Error de conexion")
    } finally {
      setIsLoading(false)
    }
  }, [campaign, tenantSlug])

  useEffect(() => {
    if (open && campaign) {
      fetchRecipients()
    } else {
      setRecipients([])
    }
  }, [open, campaign, fetchRecipients])

  if (!campaign) return null

  const visitedCount = recipients.filter((r) => r.visited).length
  const visitedPct =
    recipients.length > 0 ? Math.round((visitedCount / recipients.length) * 100) : 0
  const statusKey = campaign.status as CampaignStatus

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ent max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{campaign.name}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {CAMPAIGN_TYPE_LABEL[campaign.type as CampaignType] ?? campaign.type} · detalle y
            destinatarios
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-[12.5px] flex-1 min-h-0 flex flex-col">
          <StatusChip tone={CAMPAIGN_STATUS_TONE[statusKey] ?? "mute"}>
            {CAMPAIGN_STATUS_LABEL[statusKey] ?? campaign.status}
          </StatusChip>

          <div className="border border-ent-line rounded-[4px] px-3">
            <FieldList
              rows={[
                { label: "Mensaje", value: campaign.message ? `“${campaign.message}”` : "—" },
                { label: "Creada", value: formatDate(campaign.createdAt) },
                { label: "Programada", value: formatDate(campaign.scheduledAt) },
                { label: "Enviada", value: formatDate(campaign.sentAt) },
                {
                  label: "Destinatarios",
                  value: `${campaign.targetCount ?? 0} · enviados ${campaign.sentCount ?? 0}${
                    (campaign.skippedNoPass ?? 0) > 0
                      ? ` · ${campaign.skippedNoPass} sin pase instalado`
                      : ""
                  }`,
                },
                {
                  label: "Respondieron",
                  value:
                    recipients.length > 0
                      ? `${visitedCount} de ${recipients.length} visitaron (${visitedPct}%)`
                      : "—",
                },
              ]}
            />
          </div>

          <div className="border border-ent-line rounded-[4px] flex-1 min-h-0 flex flex-col">
            <div className="px-3 h-8 flex items-center justify-between gap-2 text-[12px] font-semibold border-b border-ent-line shrink-0">
              <span>
                Destinatarios{" "}
                <span className="font-normal text-ent-fg-3 tabular-nums">{recipients.length}</span>
              </span>
              {recipients.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[12px] gap-1"
                  onClick={() => downloadCsv(campaign, recipients, timezone)}
                  type="button"
                >
                  <Download className="w-3 h-3" />
                  Exportar CSV
                </Button>
              )}
            </div>
            <div className="overflow-y-auto min-h-0 max-h-72">
              {isLoading ? (
                <PanelMessage>
                  <Loader2 className="w-5 h-5 animate-spin" />
                </PanelMessage>
              ) : recipients.length === 0 ? (
                <PanelMessage>No hay destinatarios registrados para esta campaña.</PanelMessage>
              ) : (
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Cliente</Th>
                      <Th>Contacto</Th>
                      <Th>Visitó</Th>
                      <Th>Fecha visita</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <Tr key={r.clientId}>
                        <Td className="font-medium">{r.name}</Td>
                        <Td className="text-ent-fg-2">{r.phone || r.email || "—"}</Td>
                        <Td>
                          <StatusChip tone={r.visited ? "ok" : "mute"}>
                            {r.visited ? "Sí" : "No"}
                          </StatusChip>
                        </Td>
                        <Td className="text-ent-fg-2">
                          {r.visitedAt ? formatDate(r.visitedAt) : "—"}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
