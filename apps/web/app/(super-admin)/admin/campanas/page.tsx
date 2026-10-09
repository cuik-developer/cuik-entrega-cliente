"use client"

import { Loader2, Search } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  PageHeader,
  Panel,
  PanelFooter,
  PanelMessage,
  Toolbar,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import type { AdminCampaignRow } from "@/lib/admin/campaign-admin"
import { CampaignAdminDetailDialog, CampaignAdminTable } from "./campaign-admin-ui"

type TenantOption = { id: string; name: string; status: string }

const STATUS_OPTIONS = [
  ["", "Estado: todas"],
  ["failed", "Fallidas"],
  ["sent", "Enviadas"],
  ["scheduled", "Programadas"],
  ["sending", "Enviando"],
  ["draft", "Borradores"],
  ["cancelled", "Canceladas"],
] as const

function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ymdLocal(d)
}

/** Super-admin "Campañas": every tenant's campaigns, failures first by default. */
export default function AdminCampaignsPage() {
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantId, setTenantId] = useState("")
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [includeInternal, setIncludeInternal] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminCampaignRow[]>([])
  const [pagination, setPagination] = useState<{ total: number; totalPages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // Only the newest request may update the table (filters can change mid-flight).
  const reqSeq = useRef(0)

  // Default range: last 30 days, set after mount (local clock).
  useEffect(() => {
    setFrom(daysAgo(29))
    setTo(ymdLocal(new Date()))
    fetch("/api/admin/tenants/suggest?all=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setTenants(Array.isArray(json?.data) ? json.data : []))
      .catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    if (!from || !to) return
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", from, to })
      if (tenantId) params.set("tenantId", tenantId)
      if (status) params.set("status", status)
      if (search.trim()) params.set("search", search.trim())
      if (includeInternal) params.set("includeInternal", "1")
      const res = await fetch(`/api/admin/campaigns?${params}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo cargar")
      if (seq !== reqSeq.current) return
      setRows(json.data.items)
      setPagination(json.data.pagination)
    } catch (e) {
      if (seq === reqSeq.current) setError(e instanceof Error ? e.message : "Error de conexión")
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [page, from, to, tenantId, status, search, includeInternal])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const input =
    "h-[26px] px-2 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent"
  const failedShown = rows.filter((r) => r.status === "draft" && r.lastError).length

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin/tenants" }, { label: "Campañas" }]}
        title="Campañas"
        subtitle="Envíos de todos los comercios, con sus fallos. Haz clic en una fila para ver el detalle."
      />
      <Panel>
        <Toolbar>
          <label className="relative block">
            <Search
              className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ent-fg-3"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Buscar por nombre"
              aria-label="Buscar campaña por nombre"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className={`${input} pl-7 w-44`}
            />
          </label>
          <select
            value={tenantId}
            aria-label="Filtrar por tenant"
            onChange={(e) => {
              setTenantId(e.target.value)
              setPage(1)
            }}
            className={`${input} pr-6 cursor-pointer max-w-56`}
          >
            <option value="">Tenant: todos</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            aria-label="Filtrar por estado"
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className={`${input} pr-6 cursor-pointer`}
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            max={to}
            aria-label="Desde"
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
            className={input}
          />
          <input
            type="date"
            value={to}
            min={from}
            aria-label="Hasta"
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
            className={input}
          />
          <label className="flex items-center gap-1.5 text-[12px] text-ent-fg-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInternal}
              onChange={(e) => {
                setIncludeInternal(e.target.checked)
                setPage(1)
              }}
              className="h-3.5 w-3.5 accent-[#0b5fc0]"
            />
            Incluir demos internas
          </label>
          <span className="ml-auto text-[11.5px] text-ent-fg-3 tabular-nums">
            {loading ? "…" : pagination ? `${pagination.total} campañas` : ""}
            {!loading && failedShown > 0 && (
              <span className="text-ent-bad"> · {failedShown} fallidas en esta página</span>
            )}
          </span>
        </Toolbar>
        {loading && rows.length === 0 ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando campañas…
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
            <CampaignAdminTable rows={rows} showTenant onOpen={setOpenId} />
            {pagination && pagination.totalPages > 1 && (
              <PanelFooter>
                <span>
                  Página {page} de {pagination.totalPages}
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
      <CampaignAdminDetailDialog
        campaignId={openId}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </div>
  )
}
