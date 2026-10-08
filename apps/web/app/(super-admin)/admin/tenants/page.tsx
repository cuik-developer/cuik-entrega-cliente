"use client"

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Edit,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TenantHealthCell } from "./tenant-health"
import { type ApiTenant, openTenantPanel, type PaginationMeta, statusConfig } from "./tenant-shared"

/* ────────────────────────────────────────────────────────────
   Main Page
   ──────────────────────────────────────────────────────────── */
export default function TenantsPage() {
  const [tenants, setTenants] = useState<ApiTenant[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const openTenant = (id: string, tab?: string) =>
    router.push(tab ? `/admin/tenants/${id}?tab=${tab}` : `/admin/tenants/${id}`)

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("")
  // Deep link from Metricas ("comercios sin visitas"): /admin/tenants?q=<nombre>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")
    if (q) setSearchQuery(q)
  }, [])
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(currentPage))
      params.set("limit", "20")
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim())
      }

      const res = await fetch(`/api/admin/tenants?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`)
      }
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

  // Compute KPIs from real data
  const activeTenants = tenants.filter((t) => t.status === "active").length
  const pendingTenants = tenants.filter((t) => t.status === "pending").length
  const totalClients = tenants.reduce((sum, t) => sum + (Number(t.clientCount) || 0), 0)
  const totalVisits = tenants.reduce((sum, t) => sum + (Number(t.visitCount) || 0), 0)

  const kpis = [
    {
      label: "Tenants Activos",
      value: String(activeTenants),
      sub: pendingTenants > 0 ? `+${pendingTenants} pendientes` : "0 pendientes",
      subColor: pendingTenants > 0 ? "text-amber-600" : "text-slate-400",
      icon: Building2,
      color: "bg-blue-50 text-[#0e70db]",
    },
    {
      label: "Clientes Totales",
      value: totalClients.toLocaleString(),
      sub: "En tenants visibles",
      subColor: "text-slate-400",
      icon: Users,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Visitas Totales",
      value: totalVisits.toLocaleString(),
      sub: "En tenants visibles",
      subColor: "text-slate-400",
      icon: TrendingUp,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "Total Tenants",
      value: String(pagination?.total ?? tenants.length),
      sub: "En la plataforma",
      subColor: "text-slate-400",
      icon: CreditCard,
      color: "bg-orange-50 text-[#ff4810]",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Gestion de Tenants</h1>
        <p className="text-slate-500 text-sm">Administra todos los comercios de la plataforma.</p>
      </div>

      {/* KPIs */}
      {!loading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="border border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">{kpi.label}</span>
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.color}`}
                  >
                    <kpi.icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900">{kpi.value}</div>
                <div className={`text-xs mt-0.5 font-medium ${kpi.subColor}`}>{kpi.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tenants table with search/filter */}
      <Card className="border border-slate-200">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold text-slate-900">Todos los Tenants</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-9 h-9 sm:h-8 text-sm sm:text-xs w-full sm:w-48"
                />
              </div>
              <div className="relative">
                <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-9 sm:h-8 w-full sm:w-auto pl-8 pr-3 rounded-md border border-slate-200 bg-white text-sm sm:text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0e70db] focus:border-transparent appearance-none cursor-pointer"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="trial">Demo</option>
                  <option value="pending">Pendiente</option>
                  <option value="expired">Vencido</option>
                  <option value="paused">Pausado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">Cargando tenants...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 space-y-3">
              <XCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchTenants} className="text-xs gap-1">
                <RefreshCw className="w-3 h-3" /> Reintentar
              </Button>
            </div>
          ) : (
            <>
              {/* Phone: one card per tenant with big tap targets. */}
              <div className="md:hidden space-y-3">
                {tenants.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No se encontraron tenants con esos filtros.
                  </p>
                ) : (
                  tenants.map((t) => {
                    const cfg = statusConfig[t.status]
                    const trialDaysLeft =
                      t.status === "trial" && t.trialEndsAt
                        ? Math.max(
                            0,
                            Math.ceil(
                              (new Date(t.trialEndsAt).getTime() - Date.now()) /
                                (1000 * 60 * 60 * 24),
                            ),
                          )
                        : null
                    const open = (tab: string) => openTenant(t.id, tab)
                    return (
                      <div key={t.id} className="rounded-xl border border-slate-200 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/admin/tenants/${t.id}`}
                              className="block font-semibold text-slate-900 truncate hover:text-[#0e70db]"
                            >
                              {t.name}
                            </Link>
                            <div className="text-xs text-slate-400 truncate">{t.slug}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge className={`text-xs border ${cfg?.color ?? ""}`}>
                              {cfg?.label ?? t.status}
                              {trialDaysLeft !== null && ` \u2014 ${trialDaysLeft}d`}
                            </Badge>
                            {t.appleConfig?.mode === "production" ? (
                              <Badge className="text-xs border bg-emerald-100 text-emerald-700 border-emerald-200">
                                <Shield className="w-3 h-3 mr-0.5" />
                                Apple
                              </Badge>
                            ) : t.appleConfig?.mode === "configuring" ? (
                              <Badge className="text-xs border bg-amber-100 text-amber-700 border-amber-200">
                                <Shield className="w-3 h-3 mr-0.5" />
                                Configurando
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            {t.health ? (
                              <TenantHealthCell
                                health={t.health}
                                clientCount={Number(t.clientCount)}
                              />
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>
                          <div className="flex gap-4 shrink-0 text-right">
                            <div>
                              <div className="text-[11px] text-slate-400">Clientes</div>
                              <div className="font-semibold tabular-nums">
                                {Number(t.clientCount).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] text-slate-400">Visitas</div>
                              <div className="font-semibold tabular-nums text-slate-600">
                                {Number(t.visitCount).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 gap-1.5 text-xs"
                            onClick={() => openTenantPanel(t.id)}
                          >
                            <Eye className="w-3.5 h-3.5" /> Panel
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 gap-1.5 text-xs"
                            onClick={() => open("apple")}
                          >
                            <Shield className="w-3.5 h-3.5" /> Apple
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 gap-1.5 text-xs"
                            onClick={() => open("editar")}
                          >
                            <Edit className="w-3.5 h-3.5" /> Editar
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <table className="w-full text-sm hidden md:table">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 text-left font-semibold">Tenant</th>
                    <th className="pb-2 text-left font-semibold">Estado</th>
                    <th className="pb-2 text-left font-semibold">Salud</th>
                    <th className="pb-2 text-right font-semibold">Clientes</th>
                    <th className="pb-2 text-right font-semibold">Visitas</th>
                    <th className="pb-2 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                        No se encontraron tenants con esos filtros.
                      </td>
                    </tr>
                  ) : (
                    tenants.map((t) => {
                      const cfg = statusConfig[t.status]
                      const trialDaysLeft =
                        t.status === "trial" && t.trialEndsAt
                          ? Math.max(
                              0,
                              Math.ceil(
                                (new Date(t.trialEndsAt).getTime() - Date.now()) /
                                  (1000 * 60 * 60 * 24),
                              ),
                            )
                          : null
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-2.5">
                            <Link
                              href={`/admin/tenants/${t.id}`}
                              className="font-medium text-slate-900 hover:text-[#0e70db] hover:underline"
                            >
                              {t.name}
                            </Link>
                            <div className="text-xs text-slate-400">{t.slug}</div>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge className={`text-xs border ${cfg?.color ?? ""}`}>
                                {cfg?.label ?? t.status}
                                {trialDaysLeft !== null && ` \u2014 ${trialDaysLeft}d`}
                              </Badge>
                              {t.appleConfig?.mode === "production" ? (
                                <Badge className="text-xs border bg-emerald-100 text-emerald-700 border-emerald-200">
                                  <Shield className="w-3 h-3 mr-0.5" />
                                  Apple
                                </Badge>
                              ) : t.appleConfig?.mode === "configuring" ? (
                                <Badge className="text-xs border bg-amber-100 text-amber-700 border-amber-200">
                                  <Shield className="w-3 h-3 mr-0.5" />
                                  Configurando
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2.5">
                            {t.health ? (
                              <TenantHealthCell
                                health={t.health}
                                clientCount={Number(t.clientCount)}
                              />
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-medium">
                            {Number(t.clientCount).toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right text-slate-600">
                            {Number(t.visitCount).toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                title="Ver panel del comercio"
                                aria-label="Ver panel del comercio"
                                onClick={() => openTenantPanel(t.id)}
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                title="Certificado Apple"
                                aria-label="Certificado Apple"
                                onClick={() => openTenant(t.id, "apple")}
                              >
                                <Shield className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                title="Editar tenant"
                                aria-label="Editar tenant"
                                onClick={() => openTenant(t.id, "editar")}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-2">
                  <span className="text-xs text-slate-500">
                    Pagina {pagination.page} de {pagination.totalPages} ({pagination.total} tenants)
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={pagination.page <= 1}
                      title="Pagina anterior"
                      aria-label="Pagina anterior"
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={pagination.page >= pagination.totalPages}
                      title="Pagina siguiente"
                      aria-label="Pagina siguiente"
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
