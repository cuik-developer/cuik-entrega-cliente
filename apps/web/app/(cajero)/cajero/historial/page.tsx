"use client"

import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"

type VisitRecord = {
  id: string
  visitNum: number
  cycleNumber: number
  source: string
  createdAt: string
  client: {
    id: string
    name: string
    lastName: string | null
  }
}

type Pagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function HistorialPage() {
  const { tenantSlug, timezone } = useTenant()
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchVisits = useCallback(
    async (p: number) => {
      if (!tenantSlug) return
      setLoading(true)
      try {
        const res = await fetch(`/api/${tenantSlug}/visits?page=${p}&limit=20`)
        const json = await res.json()
        if (json.success) {
          setVisits(json.data.data || [])
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
    fetchVisits(page)
  }, [page, fetchVisits])

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      timeZone: timezone,
    })
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-extrabold text-gray-900">Historial</h1>
        <p className="text-sm text-gray-500 mt-1">Tus visitas registradas.</p>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {!loading && visits.length === 0 && (
        <div className="text-center py-10">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Aun no has registrado visitas</p>
        </div>
      )}

      {!loading && visits.length > 0 && (
        <>
          <div className="space-y-2">
            {visits.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-2.5"
              >
                <div className="text-right flex-shrink-0 w-14">
                  <div className="text-xs font-mono text-gray-400">{formatTime(v.createdAt)}</div>
                  <div className="text-xs text-gray-300">{formatDate(v.createdAt)}</div>
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800">
                    {v.client.name} {v.client.lastName || ""}
                  </span>
                  <span className="text-xs text-gray-400">
                    {" "}
                    · Sello {v.visitNum} (ciclo {v.cycleNumber})
                  </span>
                </div>
                <span className="text-xs text-gray-300 flex-shrink-0 uppercase">{v.source}</span>
              </div>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-500">
                Pagina {page} de {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
