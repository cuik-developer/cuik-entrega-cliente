"use client"

import {
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

type SolicitudStatus = "pending" | "approved" | "rejected"

interface Solicitud {
  id: string
  businessName: string
  businessType: string | null
  contactName: string
  email: string
  phone: string | null
  city: string | null
  message: string | null
  status: SolicitudStatus
  notes: string | null
  tenantId: string | null
  createdAt: string
}

interface Credentials {
  email: string
  tempPassword: string
}

const STATUS_CONFIG: Record<SolicitudStatus, { label: string; className: string }> = {
  pending: {
    label: "Pendiente",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  approved: {
    label: "Aprobada",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  rejected: {
    label: "Rechazada",
    className: "bg-red-100 text-red-700 border-red-200",
  },
}

const FILTER_TABS: { label: string; value: SolicitudStatus | "all" }[] = [
  { label: "Todas", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Aprobadas", value: "approved" },
  { label: "Rechazadas", value: "rejected" },
]

export default function SolicitudesAdminPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SolicitudStatus | "all">("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<Solicitud | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  // Success dialog state (after approval)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [newDesignId, setNewDesignId] = useState<string | null>(null)

  const fetchSolicitudes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== "all") params.set("status", filter)
      params.set("limit", "100")

      const res = await fetch(`/api/admin/solicitudes?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch")

      const data = await res.json()
      setSolicitudes(data.data?.items ?? [])
    } catch (err) {
      console.error("Failed to fetch solicitudes:", err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchSolicitudes()
  }, [fetchSolicitudes])

  async function handleApprove(solicitud: Solicitud) {
    setActionLoading(solicitud.id)
    try {
      const res = await fetch(`/api/admin/solicitudes/${solicitud.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Error al aprobar")
      }

      const data = await res.json()
      if (data.data?.credentials) {
        setCredentials(data.data.credentials)
      }

      await fetchSolicitudes()
    } catch (err) {
      console.error("Approve failed:", err)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRejectConfirm() {
    if (!rejectTarget || !rejectionReason.trim()) return
    setRejectLoading(true)
    try {
      const res = await fetch(`/api/admin/solicitudes/${rejectTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          rejectionReason: rejectionReason.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Error al rechazar")
      }

      setRejectTarget(null)
      setRejectionReason("")
      await fetchSolicitudes()
    } catch (err) {
      console.error("Reject failed:", err)
    } finally {
      setRejectLoading(false)
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestionar solicitudes de registro de comercios
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSolicitudes} disabled={loading}>
          <RefreshCw className={`size-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-400" />
        </div>
      ) : solicitudes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="size-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No hay solicitudes</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter !== "all"
                ? "No hay solicitudes con este filtro"
                : "Las solicitudes de registro apareceran aca"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {solicitudes.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{s.businessName}</h3>
                      <Badge variant="outline" className={STATUS_CONFIG[s.status].className}>
                        {STATUS_CONFIG[s.status].label}
                      </Badge>
                      {s.businessType && (
                        <Badge variant="secondary" className="text-xs">
                          {s.businessType}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
                      <span>{s.contactName}</span>
                      <span>{s.email}</span>
                      {s.city && <span>{s.city}</span>}
                      {s.phone && <span>{s.phone}</span>}
                    </div>
                    <div className="text-xs text-gray-400">{formatDate(s.createdAt)}</div>
                    {s.notes && (
                      <p className="text-xs text-gray-500 italic mt-1">Nota: {s.notes}</p>
                    )}
                  </div>

                  {s.status === "pending" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(s)}
                        disabled={actionLoading === s.id}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {actionLoading === s.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectTarget(s)}
                        disabled={actionLoading === s.id}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <XCircle className="size-3.5" />
                        Rechazar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null)
            setRejectionReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>
              Rechazar la solicitud de <strong>{rejectTarget?.businessName}</strong>. Ingresa el
              motivo del rechazo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo del rechazo..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectionReason.trim() || rejectLoading}
            >
              {rejectLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <XCircle className="size-3.5" />
              )}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials success dialog */}
      <Dialog
        open={credentials !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCredentials(null)
            setNewDesignId(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-5" />
              Solicitud aprobada
            </DialogTitle>
            <DialogDescription>
              Se creo el tenant y las credenciales temporales. Comparti estos datos con el comercio.
            </DialogDescription>
          </DialogHeader>

          {credentials && (
            <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-mono text-sm">{credentials.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(credentials.email, "email")}
                >
                  <Copy className="size-3.5" />
                  {copiedField === "email" ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Contrasena temporal</p>
                  <p className="font-mono text-sm font-semibold">{credentials.tempPassword}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(credentials.tempPassword, "password")}
                >
                  <Copy className="size-3.5" />
                  {copiedField === "password" ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
          )}

          {/* Link to editor */}
          {newDesignId && (
            <div className="border-t pt-3 mt-1">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <a href={`/admin/pases/${newDesignId}/editor`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Ir al Editor
                </a>
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setCredentials(null)
                setNewDesignId(null)
              }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
