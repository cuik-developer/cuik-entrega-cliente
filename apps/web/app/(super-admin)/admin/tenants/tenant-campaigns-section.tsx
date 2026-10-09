"use client"

import { Loader2, Pause, Play } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  PanelFooter,
  PanelMessage,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import type { AdminCampaignRow, AdminCampaignStats } from "@/lib/admin/campaign-admin"
import {
  RECURRING_STATUS_LABEL,
  RECURRING_STATUS_TONE,
  type RecurringStatus,
} from "@/lib/admin/campaign-labels"
import {
  CampaignAdminDetailDialog,
  CampaignAdminTable,
  fmtDateTime,
} from "../campanas/campaign-admin-ui"

type Recurring = {
  id: string
  name: string
  description: string
  status: RecurringStatus
  pausedReason: string | null
  nextRunAt: string | null
  lastRunAt: string | null
  occurrencesCount: number
  stats?: { sends: number; totalTarget: number; totalSent: number; lastSentAt: string | null }
  messages: string[]
}

const STATUS_OPTIONS = [
  ["", "Estado: todas"],
  ["failed", "Fallidas"],
  ["sent", "Enviadas"],
  ["scheduled", "Programadas"],
  ["sending", "Enviando"],
  ["draft", "Borradores"],
  ["cancelled", "Canceladas"],
] as const

/** "Campañas" section of the tenant page: figures, campaigns and recurring templates. */
export function TenantCampaignsSection({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<{
    stats: AdminCampaignStats
    campaigns: AdminCampaignRow[]
    pagination: { page: number; total: number; totalPages: number }
    recurring: Recurring[]
  } | null>(null)
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyRecurring, setBusyRecurring] = useState<string | null>(null)
  // Only the newest request may update the section (filters can change mid-flight).
  const reqSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (status) params.set("status", status)
      const res = await fetch(`/api/admin/tenants/${tenantId}/campaigns?${params}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo cargar")
      if (seq !== reqSeq.current) return
      setData(json.data)
    } catch (e) {
      if (seq === reqSeq.current) setError(e instanceof Error ? e.message : "Error de conexión")
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [tenantId, status, page])

  useEffect(() => {
    load()
  }, [load])

  async function toggleRecurring(r: Recurring) {
    const next = r.status === "active" ? "paused" : "active"
    setBusyRecurring(r.id)
    try {
      const res = await fetch(`/api/admin/recurring-campaigns/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? "No se pudo cambiar el estado")
        return
      }
      toast.success(next === "paused" ? "Recurrente pausada" : "Recurrente reanudada")
      await load()
    } finally {
      setBusyRecurring(null)
    }
  }

  const s = data?.stats
  return (
    <div className="p-4 space-y-3">
      {s && (
        <StatStrip
          stats={[
            { label: "Enviadas · 30 d", value: s.sent30d },
            { label: "Clientes alcanzados", value: s.reached30d },
            { label: "Respondieron (24 h)", value: s.responded30d },
            {
              label: "Fallidas · 30 d",
              value: (
                <span className={s.failed30d ? "text-ent-bad" : undefined}>{s.failed30d}</span>
              ),
            },
          ]}
        />
      )}

      <div className="border border-ent-line rounded-[4px]">
        <Toolbar>
          <span className="text-[12.5px] font-semibold text-ent-fg">Campañas</span>
          <select
            value={status}
            aria-label="Filtrar por estado"
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="h-[26px] pl-2 pr-6 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent cursor-pointer"
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11.5px] text-ent-fg-3 tabular-nums">
            {data ? `${data.pagination.total} campañas` : ""}
          </span>
        </Toolbar>
        {loading && !data ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
          </PanelMessage>
        ) : error ? (
          <PanelMessage>
            <span className="text-ent-bad">{error}</span>
            <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={load}>
              Reintentar
            </Button>
          </PanelMessage>
        ) : (
          <>
            <CampaignAdminTable
              rows={data?.campaigns ?? []}
              showTenant={false}
              onOpen={setOpenId}
            />
            {data && data.pagination.totalPages > 1 && (
              <PanelFooter>
                <span>
                  Página {data.pagination.page} de {data.pagination.totalPages}
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
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </PanelFooter>
            )}
          </>
        )}
      </div>

      <div className="border border-ent-line rounded-[4px]">
        <Toolbar>
          <span className="text-[12.5px] font-semibold text-ent-fg">Campañas recurrentes</span>
          <span className="ml-auto text-[11.5px] text-ent-fg-3">
            {data
              ? `${data.recurring.length} ${data.recurring.length === 1 ? "regla" : "reglas"}`
              : ""}
          </span>
        </Toolbar>
        {!data ? null : data.recurring.length === 0 ? (
          <PanelMessage>Este comercio no tiene campañas recurrentes.</PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Regla</Th>
                <Th>Estado</Th>
                <Th>Próximo envío</Th>
                <Th>Último envío</Th>
                <Th align="right">Enviadas</Th>
                <Th align="right">Alcance</Th>
                <Th align="right" className="w-28">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.recurring.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-normal font-medium text-ent-fg">{r.name}</Td>
                  <Td className="whitespace-normal text-ent-fg-2">{r.description}</Td>
                  <Td>
                    <StatusChip
                      tone={RECURRING_STATUS_TONE[r.status]}
                      title={r.pausedReason ?? undefined}
                    >
                      {RECURRING_STATUS_LABEL[r.status]}
                    </StatusChip>
                  </Td>
                  <Td className="text-ent-fg-2">
                    {r.status === "active" ? fmtDateTime(r.nextRunAt) : "—"}
                  </Td>
                  <Td className="text-ent-fg-2">{fmtDateTime(r.lastRunAt)}</Td>
                  <Td align="right">{r.stats?.sends ?? r.occurrencesCount}</Td>
                  <Td align="right">{r.stats?.totalSent ?? 0}</Td>
                  <Td align="right">
                    {r.status !== "finished" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[12px] gap-1"
                        disabled={busyRecurring === r.id}
                        onClick={() => toggleRecurring(r)}
                      >
                        {busyRecurring === r.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : r.status === "active" ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {r.status === "active" ? "Pausar" : "Reanudar"}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      <CampaignAdminDetailDialog
        campaignId={openId}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </div>
  )
}
