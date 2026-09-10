"use client"

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Gift,
  Loader2,
  Search,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { SegmentBadge, StatusBadge } from "@/components/panel/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useTenant } from "@/hooks/use-tenant"
import { SEGMENT_LABELS } from "@/lib/loyalty/client-segments"

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
  pendingRewards?: number
}

type Pagination = {
  page: number
  limit: number
  total: number
  totalPages: number
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
  const [filter, setFilter] = useState<
    "all" | "nuevo" | "frecuente" | "esporadico" | "regular" | "en_riesgo" | "inactivo" | "one_time"
  >("all")
  // "Con premio pendiente" toggle — combinable with the segment chips.
  const [pendingOnly, setPendingOnly] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Deep links: /panel/clientes?segment=en_riesgo (Analítica) and
  // /panel/clientes?pendingReward=1 (Dashboard "Para hoy").
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const s = qs.get("segment")
    if (s && s in SEGMENT_LABELS) setFilter(s as typeof filter)
    if (qs.get("pendingReward") === "1") setPendingOnly(true)
  }, [])

  const fetchClients = useCallback(
    async (p: number, search: string, segment: string, pending: boolean) => {
      if (!tenantSlug) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p), limit: "20" })
        if (search) params.set("search", search)
        if (segment !== "all") params.set("segment", segment)
        if (pending) params.set("pendingReward", "1")

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
    debounceRef.current = setTimeout(
      () => fetchClients(page, searchQuery, filter, pendingOnly),
      300,
    )
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [page, searchQuery, filter, pendingOnly, fetchClients])

  const handleExportXlsx = async () => {
    if (!tenantSlug || exporting) return
    setExporting(true)
    try {
      // NOTE: segment filter is a UX-layer convenience for the table list;
      // the export endpoint exports the full client book regardless of which
      // segment chip is selected. If per-segment export is needed later,
      // add segment support to /api/[tenant]/clients/export.
      const params = new URLSearchParams()

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {total} {pendingOnly ? "con premio pendiente" : "clientes registrados"}
          </p>
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
        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: "all", label: "Todos" },
              { v: "nuevo", label: "Nuevos" },
              { v: "frecuente", label: "Frecuentes" },
              { v: "esporadico", label: "Esporádicos" },
              { v: "regular", label: "Regulares" },
              { v: "en_riesgo", label: "En riesgo" },
              { v: "inactivo", label: "Inactivos" },
              { v: "one_time", label: "Una visita" },
            ] as const
          ).map((f) => (
            <Button
              key={f.v}
              size="sm"
              variant={filter === f.v ? "default" : "outline"}
              className={filter === f.v ? "bg-primary text-white" : ""}
              onClick={() => {
                setFilter(f.v)
                setPage(1)
              }}
            >
              {f.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={pendingOnly ? "default" : "outline"}
            className={`gap-1.5 ${pendingOnly ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : ""}`}
            onClick={() => {
              setPendingOnly((v) => !v)
              setPage(1)
            }}
            title="Solo clientes con un premio pendiente de canje"
          >
            <Gift className="w-3.5 h-3.5" />
            Con premio pendiente
          </Button>
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
                            <div className="font-medium text-foreground flex items-center gap-1.5">
                              {c.name} {c.lastName || ""}
                              {(c.pendingRewards ?? 0) > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold"
                                  title="Premio pendiente de canje"
                                >
                                  <Gift className="w-3 h-3" />
                                  {c.pendingRewards}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.phone || c.dni || ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <SegmentBadge segment={c.segment} />
                      </td>
                      <td className="p-3 text-slate-600">{c.totalVisits}</td>
                      <td className="p-3">
                        <StatusBadge status={c.status} />
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
