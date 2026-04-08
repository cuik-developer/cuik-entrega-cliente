"use client"

import { Download, Eye, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
}

interface CampaignDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: CampaignInfo | null
  tenantSlug: string
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "--"
  return new Date(dateStr).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function generateCsv(_campaign: CampaignInfo, recipients: Recipient[]): string {
  const BOM = "\uFEFF"
  const headers = ["Nombre", "Telefono", "Email", "Estado notificacion", "Visito?", "Fecha visita"]
  const rows = recipients.map((r) => [
    r.name,
    r.phone ?? "",
    r.email ?? "",
    r.status,
    r.visited ? "Si" : "No",
    r.visitedAt ? formatDate(r.visitedAt) : "",
  ])

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n")

  return BOM + csvContent
}

function downloadCsv(campaign: CampaignInfo, recipients: Recipient[]) {
  const csv = generateCsv(campaign, recipients)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            {campaign.name}
          </DialogTitle>
          <DialogDescription>Detalle de campaña y destinatarios</DialogDescription>
        </DialogHeader>

        {/* Campaign info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-muted/50 rounded-lg p-2.5">
            <div className="text-xs text-muted-foreground">Tipo</div>
            <div className="font-medium">{campaign.type === "push" ? "Push" : "Wallet Update"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5">
            <div className="text-xs text-muted-foreground">Estado</div>
            <div className="font-medium capitalize">{campaign.status}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5">
            <div className="text-xs text-muted-foreground">Fecha</div>
            <div className="font-medium">
              {formatDate(campaign.sentAt ?? campaign.scheduledAt ?? campaign.createdAt)}
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5">
            <div className="text-xs text-muted-foreground">Enviados</div>
            <div className="font-medium">
              {campaign.sentCount ?? 0} / {campaign.targetCount ?? 0}
            </div>
          </div>
        </div>

        {campaign.message && (
          <div className="bg-muted/30 rounded-lg p-3 text-sm italic text-muted-foreground">
            &ldquo;{campaign.message}&rdquo;
          </div>
        )}

        {/* Recipients table */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {recipients.length} destinatarios
            {recipients.length > 0 && (
              <span className="ml-2">
                · <span className="text-emerald-600 font-medium">{visitedCount}</span> visitaron (
                {recipients.length > 0 ? Math.round((visitedCount / recipients.length) * 100) : 0}%)
              </span>
            )}
          </div>
          {recipients.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => downloadCsv(campaign, recipients)}
              type="button"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No hay destinatarios registrados para esta campaña.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Telefono / Email</TableHead>
                  <TableHead className="text-center">Visito?</TableHead>
                  <TableHead>Fecha visita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.clientId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.phone || r.email || "--"}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.visited ? (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-[10px]">
                          Si
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[10px]">
                          No
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.visitedAt ? formatDate(r.visitedAt) : "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
