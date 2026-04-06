"use client"

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Search,
  Star,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useTenant } from "@/hooks/use-tenant"

type ClientRow = {
  id: string
  name: string
  lastName: string | null
  dni: string | null
  phone: string | null
  email: string | null
  totalVisits: number
  currentCycle: number
  tier: string | null
  status: string
  createdAt: string
  segment: string | null
}

type ClientDetail = {
  client: ClientRow & { qrCode: string | null }
  segment: string
  stamps: { current: number | null; max: number | null }
  pendingRewards: number
  promotion: { type: string; rewardValue: string | null } | null
  points?: { balance: number; availableCatalogItems?: number }
}

type Pagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

const tierColors: Record<string, string> = {
  Nuevo: "bg-blue-100 text-blue-700",
  Regular: "bg-emerald-100 text-emerald-700",
  VIP: "bg-amber-100 text-amber-700",
}

const segmentColors: Record<string, string> = {
  nuevo: "bg-sky-100 text-sky-700",
  frecuente: "bg-emerald-100 text-emerald-700",
  esporadico: "bg-amber-100 text-amber-700",
  one_time: "bg-slate-100 text-slate-600",
  en_riesgo: "bg-orange-100 text-orange-700",
  inactivo: "bg-red-100 text-red-700",
}

const segmentLabels: Record<string, string> = {
  nuevo: "Nuevo",
  frecuente: "Frecuente",
  esporadico: "Esporádico",
  one_time: "Una visita",
  en_riesgo: "En riesgo",
  inactivo: "Inactivo",
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  blocked: "bg-red-100 text-red-700",
}

function ClienteDetailModal({ client, onClose }: { client: ClientDetail; onClose: () => void }) {
  const isPoints = client.promotion?.type === "points"
  const stampsMax = client.stamps.max ?? 0
  const stampsCurrent = client.stamps.current ?? 0
  const pct = stampsMax > 0 ? (stampsCurrent / stampsMax) * 100 : 0

  return (
    // biome-ignore lint/a11y/useSemanticElements: modal backdrop overlay, not a semantic button
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="button"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClose()
      }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                {client.client.name[0]}
              </div>
              <div>
                <h3 className="font-bold text-foreground">
                  {client.client.name} {client.client.lastName || ""}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {client.client.phone || ""}{" "}
                  {client.client.email ? `· ${client.client.email}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {(isPoints
              ? [
                  { label: "Visitas totales", value: client.client.totalVisits },
                  { label: "Puntos", value: client.points?.balance ?? 0 },
                  { label: "Premios disp.", value: client.points?.availableCatalogItems ?? 0 },
                ]
              : [
                  { label: "Visitas totales", value: client.client.totalVisits },
                  { label: "Sellos", value: `${stampsCurrent}/${stampsMax || "?"}` },
                  { label: "Premios pend.", value: client.pendingRewards },
                ]
            ).map((k) => (
              <div key={k.label} className="bg-muted rounded-xl p-3 text-center">
                <div className="text-xl font-extrabold text-foreground">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>
          {!isPoints && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progreso del ciclo</span>
                <span>
                  {stampsCurrent}/{stampsMax || "?"}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
          {isPoints && client.points && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Balance</span>
              <span className="text-sm font-bold text-foreground">{client.points.balance} pts</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Segmento</span>
            <Badge className={segmentColors[client.segment || ""] || "bg-slate-100 text-slate-600"}>
              {segmentLabels[client.segment || ""] || "-"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tier</span>
            <Badge
              className={tierColors[client.client.tier || ""] || "bg-slate-100 text-slate-600"}
            >
              {client.client.tier || "Sin tier"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estado</span>
            <Badge className={statusColors[client.client.status] || "bg-slate-100 text-slate-600"}>
              {client.client.status === "active"
                ? "Activo"
                : client.client.status === "inactive"
                  ? "Inactivo"
                  : client.client.status}
            </Badge>
          </div>
          {client.pendingRewards > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
              <Star className="w-4 h-4" />
              Tiene {client.pendingRewards} premio(s) pendiente(s) de canjear!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const { tenantSlug } = useTenant()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [exporting, setExporting] = useState(false)
  const [clientRows, setClientRows] = useState<ClientRow[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ClientDetail | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchClients = useCallback(
    async (p: number, search: string, status: string) => {
      if (!tenantSlug) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p), limit: "20" })
        if (search) params.set("search", search)
        if (status !== "all") params.set("status", status)

        const res = await fetch(`/api/${tenantSlug}/clients?${params}`)
        const json = await res.json()
        if (json.success) {
          setClientRows(json.data.data || [])
          setPagination(json.data.pagination || null)
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    },
    [tenantSlug],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchClients(page, searchQuery, filter), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [page, searchQuery, filter, fetchClients])

  const _selectClient = async (clientId: string) => {
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}`)
      const json = await res.json()
      if (json.success) {
        setSelected(json.data)
      }
    } catch {
      // silent
    }
  }

  const handleExportXlsx = async () => {
    if (!tenantSlug || exporting) return
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (filter !== "all") params.set("status", filter)

      const res = await fetch(`/api/${tenantSlug}/clients/export?${params}`)
      if (!res.ok) return

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // silent
    } finally {
      setExporting(false)
    }
  }

  const navigateToClient = (clientId: string) => {
    router.push(`/panel/clientes/${clientId}`)
  }

  const total = pagination?.total ?? 0

  return (
    <div className="space-y-6">
      {selected && <ClienteDetailModal client={selected} onClose={() => setSelected(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">{total} clientes registrados</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="text-sm gap-2"
            onClick={handleExportXlsx}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Exportar Excel
          </Button>
          <Button
            className="bg-primary text-white text-sm gap-2"
            onClick={() => window.open(`/${tenantSlug}/registro`, "_blank")}
          >
            <ExternalLink className="w-4 h-4" /> Pagina de registro
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, DNI o celular..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "inactive"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className={filter === f ? "bg-primary text-white" : ""}
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
            >
              {f === "all" ? "Todos" : f === "active" ? "Activos" : "Inactivos"}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : clientRows.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No se encontraron clientes
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="p-3 text-left font-semibold">Cliente</th>
                    <th className="p-3 text-left font-semibold">Segmento</th>
                    <th className="p-3 text-left font-semibold">Tier</th>
                    <th className="p-3 text-left font-semibold">Visitas</th>
                    <th className="p-3 text-left font-semibold">Estado</th>
                    <th className="p-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((c) => (
                    // biome-ignore lint/a11y/useSemanticElements: table row acts as clickable navigation
                    <tr
                      key={c.id}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigateToClient(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") navigateToClient(c.id)
                      }}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                            {c.name[0]}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {c.name} {c.lastName || ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.phone || c.dni || ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge
                          className={`text-xs ${segmentColors[c.segment || ""] || "bg-slate-100 text-slate-600"}`}
                        >
                          {segmentLabels[c.segment || ""] || "-"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          className={`text-xs ${tierColors[c.tier || ""] || "bg-slate-100 text-slate-600"}`}
                        >
                          {c.tier || "-"}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-600">{c.totalVisits}</td>
                      <td className="p-3">
                        <Badge className={`text-xs ${statusColors[c.status] || "bg-slate-100"}`}>
                          {c.status === "active"
                            ? "Activo"
                            : c.status === "inactive"
                              ? "Inactivo"
                              : c.status}
                        </Badge>
                      </td>
                      <td
                        className="p-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => navigateToClient(c.id)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Pagina {page} de {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
