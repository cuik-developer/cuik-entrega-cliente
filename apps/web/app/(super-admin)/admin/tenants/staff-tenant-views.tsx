"use client"

import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { useCan } from "@/components/admin/admin-access"
import {
  DataTable,
  FieldList,
  PageHeader,
  Panel,
  PanelFooter,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { TenantLogo } from "@/components/admin/tenant-logo"
import { Button } from "@/components/ui/button"
import type { StaffTenantView } from "@/lib/admin/staff-redact"
import type { TenantHealth } from "./tenant-health"
import { type PaginationMeta, statusConfig, type TenantStatus } from "./tenant-shared"

/**
 * Equipo Cuik "tenants_view": read-only list and card of each tenant, fed by
 * the redacted API responses (no contact data, billing, Apple config or
 * client lists). There is no action here on purpose.
 */

type Row = Omit<StaffTenantView, "health" | "status"> & {
  status: TenantStatus
  health: TenantHealth | null
}

function fmtDate(value: string | Date | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
}

function StatusCell({ status }: { status: TenantStatus }) {
  const cfg = statusConfig[status] ?? { label: status, tone: "mute" as const }
  return <StatusChip tone={cfg.tone}>{cfg.label}</StatusChip>
}

export function StaffTenantList() {
  const [rows, setRows] = useState<Row[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" })
      if (search.trim()) params.set("search", search.trim())
      const res = await fetch(`/api/admin/tenants?${params}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo cargar")
      if (id !== seq.current) return
      setRows(json.data.items)
      setPagination(json.data.pagination)
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : "Error de conexión")
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Tenants" }]}
        title="Tenants"
        subtitle="Vista de solo lectura de los comercios (Equipo Cuik)."
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
              aria-label="Buscar comercio por nombre"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="h-[26px] pl-7 pr-2 w-52 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent"
            />
          </label>
          <span className="ml-auto text-[11.5px] text-ent-fg-3 tabular-nums">
            {loading ? "…" : pagination ? `${pagination.total} comercios` : ""}
          </span>
        </Toolbar>
        {loading && rows.length === 0 ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando comercios…
          </PanelMessage>
        ) : error ? (
          <PanelMessage>
            <span className="text-ent-bad">{error}</span>
            <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={load}>
              Reintentar
            </Button>
          </PanelMessage>
        ) : rows.length === 0 ? (
          <PanelMessage>No hay comercios con ese nombre.</PanelMessage>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <Th>Comercio</Th>
                  <Th>Estado</Th>
                  <Th>Plan</Th>
                  <Th align="right">Clientes</Th>
                  <Th align="right">Visitas</Th>
                  <Th>Creado</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="flex items-center gap-2 font-medium text-ent-fg hover:text-ent-accent hover:underline"
                      >
                        <TenantLogo
                          branding={t.branding}
                          name={t.name}
                          className="w-6 h-6 text-[11px]"
                        />
                        <span className="truncate max-w-[260px]">{t.name}</span>
                      </Link>
                    </Td>
                    <Td>
                      <StatusCell status={t.status} />
                    </Td>
                    <Td className="text-ent-fg-2">{t.planName ?? "—"}</Td>
                    <Td align="right">{t.clientCount.toLocaleString("es-PE")}</Td>
                    <Td align="right">{t.visitCount.toLocaleString("es-PE")}</Td>
                    <Td className="text-ent-fg-2">{fmtDate(t.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
            {pagination && pagination.totalPages > 1 && (
              <PanelFooter>
                <span>
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="h-6 w-6"
                    disabled={page <= 1}
                    aria-label="Página anterior"
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="h-6 w-6"
                    disabled={page >= pagination.totalPages}
                    aria-label="Página siguiente"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </PanelFooter>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}

export function StaffTenantDetail({ id }: { id: string }) {
  const [tenant, setTenant] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const canDesigns = useCan("designs")

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the fetch on "Reintentar"
  useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/admin/tenants/${id}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success) {
          throw new Error(
            res.status === 404 ? "Este tenant no existe." : (json?.error ?? "No se pudo cargar"),
          )
        }
        if (!cancelled) setTenant(json.data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error de conexión")
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const crumbs = [
    { label: "Inicio", href: "/admin" },
    { label: "Tenants", href: "/admin/tenants" },
    { label: tenant?.name ?? "Tenant" },
  ]

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader crumbs={crumbs} title="Tenant" />
        <Panel>
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
        </Panel>
      </div>
    )
  }
  if (!tenant) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-ent-fg-3" />
      </div>
    )
  }

  const h = tenant.health
  const branding = (tenant.branding ?? {}) as { primaryColor?: string; accentColor?: string }
  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={crumbs}
        title={
          <span className="flex items-center gap-2">
            <TenantLogo
              branding={tenant.branding}
              name={tenant.name}
              className="w-7 h-7 text-[12px]"
            />
            {tenant.name}
          </span>
        }
        subtitle="Vista de solo lectura (Equipo Cuik)."
        actions={
          canDesigns ? (
            <Link href="/admin/pases" className="text-[12.5px] text-ent-accent hover:underline">
              Ver diseños de pases
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Comercio" />
          <div className="px-3">
            <FieldList
              rows={[
                { label: "Estado", value: <StatusCell status={tenant.status} /> },
                { label: "Slug", value: tenant.slug },
                { label: "Rubro", value: tenant.businessType ?? "—" },
                { label: "Plan", value: tenant.planName ?? "—" },
                { label: "Zona horaria", value: tenant.timezone ?? "—" },
                { label: "Creado", value: fmtDate(tenant.createdAt) },
                { label: "Activado", value: fmtDate(tenant.activatedAt) },
                { label: "Fin de la demo", value: fmtDate(tenant.trialEndsAt) },
              ]}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Programa (cifras agregadas)" />
          <div className="px-3">
            <FieldList
              rows={[
                { label: "Clientes", value: tenant.clientCount.toLocaleString("es-PE") },
                { label: "Visitas", value: tenant.visitCount.toLocaleString("es-PE") },
                { label: "Premios", value: tenant.rewardCount.toLocaleString("es-PE") },
                { label: "Tasa de retorno", value: `${tenant.returnRate}%` },
                {
                  label: "Visitas (30 días)",
                  value: h ? h.visits30d.toLocaleString("es-PE") : "—",
                },
                {
                  label: "Clientes nuevos (30 días)",
                  value: h ? h.newClients30d.toLocaleString("es-PE") : "—",
                },
                { label: "Pases instalados", value: h ? h.installed.toLocaleString("es-PE") : "—" },
                { label: "Última visita", value: fmtDate(h?.lastVisitAt ?? null) },
              ]}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Branding" />
          <div className="px-3">
            <FieldList
              rows={[
                {
                  label: "Logo",
                  value: (
                    <TenantLogo
                      branding={tenant.branding}
                      name={tenant.name}
                      className="w-10 h-10 text-[14px]"
                    />
                  ),
                },
                { label: "Color principal", value: branding.primaryColor ?? "—" },
                { label: "Color de acento", value: branding.accentColor ?? "—" },
              ]}
            />
          </div>
        </Panel>
      </div>
    </div>
  )
}
