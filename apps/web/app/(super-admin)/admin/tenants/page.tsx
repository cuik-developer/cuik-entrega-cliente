"use client"

import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Loader2,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import {
  DataTable,
  PageHeader,
  Panel,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BillingCell, BillingNotices, money, useBillingSummary } from "./billing-widgets"
import { TenantHealthCell } from "./tenant-health"
import { type ApiTenant, openTenantPanel, type PaginationMeta, statusConfig } from "./tenant-shared"

const STATUS_OPTIONS = [
  ["all", "Todos los estados"],
  ["active", "Activo"],
  ["trial", "Demo"],
  ["pending", "Pendiente"],
  ["expired", "Vencido"],
  ["paused", "Pausado"],
  ["cancelled", "Cancelado"],
] as const

function trialDaysLeft(t: ApiTenant): number | null {
  if (t.status !== "trial" || !t.trialEndsAt) return null
  return Math.max(
    0,
    Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  )
}

function AppleChip({ t }: { t: ApiTenant }) {
  const mode = t.appleConfig?.mode
  if (mode === "production") return <StatusChip tone="ok">Apple</StatusChip>
  if (mode === "configuring") return <StatusChip tone="warn">Apple en configuración</StatusChip>
  return null
}

/* ────────────────────────────────────────────────────────────
   Tenant manager
   ──────────────────────────────────────────────────────────── */
/** `useSearchParams` needs a Suspense boundary for the production build to prerender the page. */
export default function TenantsPage() {
  return (
    <Suspense fallback={null}>
      <TenantsPageInner />
    </Suspense>
  )
}

function TenantsPageInner() {
  const [tenants, setTenants] = useState<ApiTenant[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const billingSummary = useBillingSummary()

  const router = useRouter()
  const openTenant = (id: string, tab?: string) =>
    router.push(tab ? `/admin/tenants/${id}?tab=${tab}` : `/admin/tenants/${id}`)

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  // Deep link from Metricas and the top-bar search: /admin/tenants?q=<nombre>.
  // Read reactively: the top-bar search pushes a new `?q=` while this page is open.
  const urlQuery = useSearchParams().get("q") ?? ""
  useEffect(() => {
    if (urlQuery) {
      setSearchQuery(urlQuery)
      setCurrentPage(1)
    }
  }, [urlQuery])

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(currentPage))
      params.set("limit", "20")
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (searchQuery.trim()) params.set("search", searchQuery.trim())

      const res = await fetch(`/api/admin/tenants?${params.toString()}`)
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`)
      const json = await res.json()
      setTenants(json.data.items)
      setPagination(json.data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar tenants")
    } finally {
      setLoading(false)
    }
  }, [currentPage, statusFilter, searchQuery])

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchTenants()
    }, 300)
    return () => clearTimeout(timeout)
  }, [fetchTenants])

  // Figures for the strip, from the visible page
  const activeTenants = tenants.filter((t) => t.status === "active").length
  const pendingTenants = tenants.filter((t) => t.status === "pending").length
  const totalClients = tenants.reduce((sum, t) => sum + (Number(t.clientCount) || 0), 0)
  const totalVisits = tenants.reduce((sum, t) => sum + (Number(t.visitCount) || 0), 0)
  const total = pagination?.total ?? tenants.length
  const overdue = billingSummary?.overdue.length ?? 0
  const dueSoon = billingSummary?.dueSoon.length ?? 0

  const from = pagination ? (pagination.page - 1) * pagination.limit + 1 : 1
  const to = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin/tenants" }, { label: "Tenants" }]}
        title="Tenants"
        subtitle="Todos los comercios de la plataforma"
        actions={
          <Button asChild size="sm" variant="outline" className="h-7 text-[12.5px]">
            <Link href="/admin/solicitudes">Ver solicitudes</Link>
          </Button>
        }
      />

      {!error && (tenants.length > 0 || !loading) && (
        <StatStrip
          stats={[
            {
              label: "Activos",
              value: activeTenants,
              hint: `de ${total}${pendingTenants ? ` · ${pendingTenants} pendiente${pendingTenants === 1 ? "" : "s"}` : ""}`,
              tone: pendingTenants ? "warn" : "mute",
            },
            { label: "Clientes", value: totalClients.toLocaleString("es-PE") },
            { label: "Visitas", value: totalVisits.toLocaleString("es-PE") },
            {
              label: "Facturación",
              value: billingSummary ? (
                <span className={overdue ? "text-ent-bad" : undefined}>{overdue}</span>
              ) : (
                "—"
              ),
              hint: billingSummary
                ? `sin registrar · ${dueSoon} esta semana`
                : "cargando facturación",
              tone: "mute",
            },
          ]}
        />
      )}

      <BillingNotices data={billingSummary} />

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
              aria-label="Buscar tenant por nombre"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="h-[26px] w-full sm:w-52 pl-7 pr-2 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg placeholder:text-ent-fg-3 focus:outline-none focus:border-ent-accent"
            />
          </label>
          <select
            value={statusFilter}
            aria-label="Filtrar por estado"
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="h-[26px] pl-2 pr-6 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent cursor-pointer"
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {v === "all" ? "Estado: todos" : `Estado: ${l}`}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11.5px] text-ent-fg-3 tabular-nums">
            {loading ? "…" : `${total} ${total === 1 ? "tenant" : "tenants"}`}
          </span>
        </Toolbar>

        {loading && tenants.length === 0 ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando tenants…
          </PanelMessage>
        ) : error ? (
          <PanelMessage>
            <XCircle className="w-6 h-6 text-ent-bad" />
            <p className="text-ent-bad">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTenants}
              className="h-7 text-[12px] gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reintentar
            </Button>
          </PanelMessage>
        ) : tenants.length === 0 ? (
          <PanelMessage>No se encontraron tenants con esos filtros.</PanelMessage>
        ) : (
          <>
            {/* Phone: one row-card per tenant with big tap targets. */}
            <div className="md:hidden divide-y divide-ent-line">
              {tenants.map((t) => {
                const cfg = statusConfig[t.status]
                const days = trialDaysLeft(t)
                return (
                  <div key={t.id} className="p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="block font-semibold text-ent-accent truncate hover:underline"
                        >
                          {t.name}
                        </Link>
                        <div className="text-[11px] text-ent-fg-3 truncate">
                          {t.slug}
                          {t.planName ? ` · ${t.planName}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusChip tone={cfg?.tone ?? "mute"}>
                          {days !== null ? `Demo · ${days} d` : (cfg?.label ?? t.status)}
                        </StatusChip>
                        <AppleChip t={t} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {t.health ? (
                          <TenantHealthCell health={t.health} clientCount={Number(t.clientCount)} />
                        ) : (
                          <span className="text-ent-fg-3">—</span>
                        )}
                      </div>
                      <div className="flex gap-4 shrink-0 text-right tabular-nums">
                        <div>
                          <div className="text-[11px] text-ent-fg-3">Clientes</div>
                          <div className="font-semibold">
                            {Number(t.clientCount).toLocaleString("es-PE")}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-ent-fg-3">Visitas</div>
                          <div className="font-semibold text-ent-fg-2">
                            {Number(t.visitCount).toLocaleString("es-PE")}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <BillingCell billing={t.billing ?? null} tenantId={t.id} />
                      <span className="text-[12px] text-ent-fg-2 tabular-nums">
                        {t.billing?.monthlyAmount != null
                          ? money(t.billing.monthlyAmount, t.billing.currency ?? "PEN")
                          : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1.5 text-[12px]"
                        onClick={() => openTenantPanel(t.id)}
                      >
                        <Eye className="w-3.5 h-3.5" /> Panel
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1.5 text-[12px]"
                        onClick={() => openTenant(t.id, "apple")}
                      >
                        <Shield className="w-3.5 h-3.5" /> Apple
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1.5 text-[12px]"
                        onClick={() => openTenant(t.id, "editar")}
                      >
                        <Edit className="w-3.5 h-3.5" /> Editar
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden md:block">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Tenant</Th>
                    <Th>Estado</Th>
                    <Th>Salud</Th>
                    <Th align="right">Clientes</Th>
                    <Th align="right">Visitas</Th>
                    <Th>Próxima factura</Th>
                    <Th align="right">Monto</Th>
                    <Th align="right" className="w-10">
                      <span className="sr-only">Acciones</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => {
                    const cfg = statusConfig[t.status]
                    const days = trialDaysLeft(t)
                    return (
                      <Tr key={t.id}>
                        <Td className="whitespace-normal">
                          <Link
                            href={`/admin/tenants/${t.id}`}
                            className="font-medium text-ent-accent hover:underline leading-tight"
                          >
                            {t.name}
                          </Link>
                          <div className="text-[11px] text-ent-fg-3 leading-tight">
                            {t.slug}
                            {t.planName ? ` · ${t.planName}` : " · Sin plan"}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-3 flex-wrap">
                            <StatusChip tone={cfg?.tone ?? "mute"}>
                              {days !== null ? `Demo · ${days} d` : (cfg?.label ?? t.status)}
                            </StatusChip>
                            <AppleChip t={t} />
                          </div>
                        </Td>
                        <Td>
                          {t.health ? (
                            <TenantHealthCell
                              health={t.health}
                              clientCount={Number(t.clientCount)}
                            />
                          ) : (
                            <span className="text-ent-fg-3">—</span>
                          )}
                        </Td>
                        <Td align="right" className="font-medium">
                          {Number(t.clientCount).toLocaleString("es-PE")}
                        </Td>
                        <Td align="right" className="text-ent-fg-2">
                          {Number(t.visitCount).toLocaleString("es-PE")}
                        </Td>
                        <Td>
                          <BillingCell billing={t.billing ?? null} tenantId={t.id} />
                        </Td>
                        <Td align="right" className="text-ent-fg-2">
                          {t.billing?.monthlyAmount != null ? (
                            money(t.billing.monthlyAmount, t.billing.currency ?? "PEN")
                          ) : (
                            <span className="text-ent-fg-3">—</span>
                          )}
                        </Td>
                        <Td align="right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="h-7 w-7 text-ent-fg-3 hover:text-ent-fg"
                                aria-label={`Acciones de ${t.name}`}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-[12.5px]">
                              <DropdownMenuItem onClick={() => openTenant(t.id)}>
                                Abrir tenant
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTenantPanel(t.id)}>
                                <Eye className="w-3.5 h-3.5" /> Ver panel del comercio
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openTenant(t.id, "facturacion")}>
                                <Receipt className="w-3.5 h-3.5" /> Facturación
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTenant(t.id, "apple")}>
                                <Shield className="w-3.5 h-3.5" /> Certificado Apple
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTenant(t.id, "editar")}>
                                <Edit className="w-3.5 h-3.5" /> Datos del negocio
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </div>

            <PanelFooter>
              <span>
                {pagination
                  ? `${from} a ${to} de ${pagination.total}`
                  : `${tenants.length} tenants`}
              </span>
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="h-6 w-6"
                    disabled={pagination.page <= 1}
                    title="Página anterior"
                    aria-label="Página anterior"
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </Button>
                  <span className="min-w-6 h-6 px-1.5 grid place-items-center rounded-[3px] border border-ent-line-strong bg-ent-panel text-ent-fg tabular-nums">
                    {pagination.page}
                  </span>
                  <span>de {pagination.totalPages}</span>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="h-6 w-6"
                    disabled={pagination.page >= pagination.totalPages}
                    title="Página siguiente"
                    aria-label="Página siguiente"
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </PanelFooter>
          </>
        )}
      </Panel>
    </div>
  )
}
