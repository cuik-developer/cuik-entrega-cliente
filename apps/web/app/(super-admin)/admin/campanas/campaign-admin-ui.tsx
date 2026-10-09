"use client"

import { Loader2, RotateCcw } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
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
import type { AdminCampaignDetail, AdminCampaignRow } from "@/lib/admin/campaign-admin"
import {
  CAMPAIGN_TYPE_LABEL,
  type CampaignType,
  CHANNEL_LABEL,
  isFailed,
  statusLabel,
  statusTone,
} from "@/lib/admin/campaign-labels"

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function typeLabel(t: string): string {
  return CAMPAIGN_TYPE_LABEL[t as CampaignType] ?? t
}

/** "Enviada" or "Programada" date, whichever applies. */
function whenOf(c: AdminCampaignRow): string {
  if (c.sentAt) return fmtDateTime(c.sentAt)
  if (isFailed(c) && c.lastErrorAt) return `Falló ${fmtDateTime(c.lastErrorAt)}`
  if (c.status === "scheduled" && c.scheduledAt) return `Prog. ${fmtDateTime(c.scheduledAt)}`
  return fmtDateTime(c.createdAt)
}

function Effectiveness({ c }: { c: AdminCampaignRow }) {
  const e = c.effectiveness
  if (!e) return <span className="text-ent-fg-3">—</span>
  const tone = e.conversionRate >= 10 ? "ok" : e.conversionRate >= 5 ? "warn" : "bad"
  return (
    <StatusChip tone={tone} title={`${e.conversions} de ${e.totalSent} visitaron en 24 h`}>
      {e.conversions} · {e.conversionRate}%
    </StatusChip>
  )
}

/** Shared table: the tenant section hides the tenant column, the global page shows it. */
export function CampaignAdminTable({
  rows,
  showTenant,
  onOpen,
}: {
  rows: AdminCampaignRow[]
  showTenant: boolean
  onOpen: (id: string) => void
}) {
  if (rows.length === 0) return <PanelMessage>No hay campañas con esos filtros.</PanelMessage>
  return (
    <DataTable>
      <thead>
        <tr>
          {showTenant && <Th>Tenant</Th>}
          <Th>Campaña</Th>
          <Th>Estado</Th>
          <Th>Tipo</Th>
          <Th>Fecha</Th>
          <Th align="right">Destinatarios</Th>
          <Th align="right">Enviados</Th>
          <Th align="right">Fallidos</Th>
          <Th>Respondieron</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <Tr key={c.id} className="cursor-pointer" onClick={() => onOpen(c.id)}>
            {showTenant && (
              <Td className="whitespace-normal">
                <Link
                  href={`/admin/tenants/${c.tenantId}?tab=campanas`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-ent-accent hover:underline"
                >
                  {c.tenantName}
                </Link>
              </Td>
            )}
            <Td className="whitespace-normal">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(c.id)
                }}
                className="font-medium text-ent-fg hover:text-ent-accent hover:underline text-left"
              >
                {c.name}
              </button>
              <div className="text-[11px] text-ent-fg-3 leading-tight">
                {c.recurringName
                  ? `Recurrente · ${c.recurringName}`
                  : c.automation
                    ? `Automática · ${c.automation}`
                    : ""}
                {isFailed(c) && c.lastError && (
                  <span className="text-ent-bad"> · {c.lastError.slice(0, 80)}</span>
                )}
              </div>
            </Td>
            <Td>
              <StatusChip tone={statusTone(c)}>{statusLabel(c)}</StatusChip>
            </Td>
            <Td>{typeLabel(c.type)}</Td>
            <Td className="text-ent-fg-2">{whenOf(c)}</Td>
            <Td align="right">{c.targetCount}</Td>
            <Td align="right">
              {c.sentCount}
              {c.skippedNoPass > 0 && (
                <span className="text-ent-fg-3 text-[11px]"> · {c.skippedNoPass} sin pase</span>
              )}
            </Td>
            <Td align="right" className={c.failedNotifications ? "text-ent-bad" : "text-ent-fg-3"}>
              {c.failedNotifications || "—"}
            </Td>
            <Td>
              <Effectiveness c={c} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  )
}

/** Detail dialog with channel breakdown, failures and the retry action. */
export function CampaignAdminDetailDialog({
  campaignId,
  onClose,
  onChanged,
}: {
  campaignId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<AdminCampaignDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (!campaignId) {
      setDetail(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/campaigns/${campaignId}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok || !json?.success) throw new Error(json?.error ?? "No se pudo cargar la campaña")
        return json.data
      })
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error de conexión")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId, attempt])

  async function retry() {
    if (!detail || retrying) return
    if (!window.confirm(`¿Reintentar el envío de "${detail.name}"?`)) return
    setRetrying(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${detail.id}/retry`, { method: "POST" })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? "No se pudo reintentar")
        return
      }
      const r = json.data
      const first = String(r.errors?.[0] ?? "")
      if (r.status === "sent") {
        toast.success(
          `Enviada: ${r.sentCount} de ${r.targetCount}${r.failedCount ? `, ${r.failedCount} fallidos` : ""}`,
        )
      } else if (first.includes("already being sent")) {
        toast.info("Otro proceso ya está enviando esta campaña; revisa en un momento")
      } else {
        toast.error(`Volvió a fallar: ${(first || "sin detalle").slice(0, 120)}`)
      }
      onChanged()
      onClose()
    } finally {
      setRetrying(false)
    }
  }

  const c = detail
  return (
    <Dialog open={campaignId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="ent max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{c?.name ?? "Campaña"}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {c ? `${c.tenantName} · ${typeLabel(c.type)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <PanelMessage>
            <span className="text-ent-bad">{error}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[12px]"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Reintentar
            </Button>
          </PanelMessage>
        ) : loading || !c ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
          </PanelMessage>
        ) : (
          <div className="space-y-3 text-[12.5px]">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusChip tone={statusTone(c)}>{statusLabel(c)}</StatusChip>
              {isFailed(c) && (
                <Button
                  size="sm"
                  className="h-7 text-[12px] gap-1"
                  onClick={retry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Reintentar envío
                </Button>
              )}
            </div>
            {isFailed(c) && c.lastError && (
              <div className="border border-ent-line border-l-[3px] border-l-ent-bad rounded-[4px] px-3 py-2 text-ent-fg-2">
                <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 mr-2">
                  Error {c.lastErrorAt ? fmtDateTime(c.lastErrorAt) : ""}
                </span>
                {c.lastError}
              </div>
            )}
            <div className="border border-ent-line rounded-[4px] px-3">
              <FieldList
                rows={[
                  { label: "Mensaje", value: c.message ? `“${c.message}”` : "—" },
                  {
                    label: "Segmento",
                    value:
                      c.segment?.segmentName ??
                      (c.segment ? "Personalizado" : "Todos los clientes"),
                  },
                  { label: "Creada", value: fmtDateTime(c.createdAt) },
                  { label: "Programada", value: fmtDateTime(c.scheduledAt) },
                  { label: "Enviada", value: fmtDateTime(c.sentAt) },
                  {
                    label: "Destinatarios",
                    value: `${c.targetCount} · enviados ${c.sentCount}${c.skippedNoPass ? ` · ${c.skippedNoPass} sin pase instalado` : ""}`,
                  },
                  {
                    label: "Respondieron",
                    value: c.effectiveness
                      ? `${c.effectiveness.conversions} de ${c.effectiveness.totalSent} visitaron en 24 h (${c.effectiveness.conversionRate}%)`
                      : "—",
                  },
                  ...(c.recurringName ? [{ label: "Recurrente", value: c.recurringName }] : []),
                ]}
              />
            </div>
            {c.byChannel.length > 0 && (
              <div className="border border-ent-line rounded-[4px]">
                <div className="px-3 h-8 flex items-center text-[12px] font-semibold border-b border-ent-line">
                  Por canal
                </div>
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Canal</Th>
                      <Th align="right">Enviados</Th>
                      <Th align="right">Entregados</Th>
                      <Th align="right">Fallidos</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.byChannel.map((ch) => (
                      <Tr key={ch.channel}>
                        <Td>{CHANNEL_LABEL[ch.channel] ?? ch.channel}</Td>
                        <Td align="right">{ch.sent}</Td>
                        <Td align="right">{ch.delivered}</Td>
                        <Td align="right" className={ch.failed ? "text-ent-bad" : ""}>
                          {ch.failed}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
            {c.failures.length > 0 && (
              <div className="border border-ent-line rounded-[4px]">
                <div className="px-3 h-8 flex items-center text-[12px] font-semibold border-b border-ent-line">
                  Fallos por cliente ({c.failures.length}
                  {c.failures.length === 200 ? "+" : ""})
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <DataTable>
                    <thead>
                      <tr>
                        <Th>Cliente</Th>
                        <Th>Canal</Th>
                        <Th>Motivo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.failures.map((f, i) => (
                        <Tr key={`${f.clientId}-${f.channel}-${i}`}>
                          <Td>{f.clientName}</Td>
                          <Td>{CHANNEL_LABEL[f.channel] ?? f.channel}</Td>
                          <Td className="whitespace-normal text-ent-fg-2">{f.error ?? "—"}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
