"use client"

import {
  ArrowRightLeft,
  Ban,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Edit,
  Eye,
  Filter,
  Gift,
  Loader2,
  Mail,
  Paintbrush,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Stamp,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"
import { AppleCertWizard } from "./apple-cert-wizard"
import { CatalogSection } from "./catalog-section"
import { togglePromotionActive } from "./promotion-actions"
import { PromotionFormDialog } from "./promotion-form-dialog"
import { RegistrationConfigSection } from "./registration-config-section"

// ── Types ───────────────────────────────────────────────────────────

interface ApiTenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  planId: string | null
  trialEndsAt: string | null
  activatedAt: string | null
  ownerId: string | null
  createdAt: string
  updatedAt: string
  branding: unknown
  clientCount: number
  visitCount: number
  rewardCount: number
  returnRate: number
  planName: string | null
  businessType: string | null
  address: string | null
  phone: string | null
  contactEmail: string | null
  timezone: string | null
  segmentationConfig: {
    frequentMaxDays?: number
    oneTimeInactiveDays?: number
    riskMultiplier?: number
    newClientDays?: number
  } | null
  appleConfig: {
    mode?: string
    passTypeId?: string
    teamId?: string
    configuredAt?: string
    expiresAt?: string
  } | null
}

interface ApiPlan {
  id: string
  name: string
  maxLocations: number
  maxPromos: number
  maxClients: number
  features: unknown
  createdAt: string
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

type TenantStatus = "pending" | "trial" | "active" | "expired" | "cancelled" | "paused"

type PlanModalAction = "activate" | "change" | "reactivate"

interface TenantPromotion {
  id: string
  type: string
  maxVisits: number | null
  rewardValue: string | null
  active: boolean
  config: unknown
  passDesignId: string | null
}

const statusConfig: Record<TenantStatus, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  trial: { label: "Demo 7 dias", color: "bg-blue-100 text-blue-700 border-blue-200" },
  active: { label: "Activo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  expired: { label: "Vencido", color: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "Cancelado", color: "bg-slate-100 text-slate-600 border-slate-200" },
  paused: { label: "Pausado", color: "bg-orange-100 text-orange-700 border-orange-200" },
}

// ── Shared PATCH helper ──────────────────────────────────────────────

async function patchTenant(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) {
      return { ok: false, error: json.error ?? `Error ${res.status}` }
    }
    return { ok: true, data: json.data }
  } catch {
    return { ok: false, error: "Error de conexion" }
  }
}

/* ────────────────────────────────────────────────────────────
   Business type options for the edit form
   ──────────────────────────────────────────────────────────── */
const BUSINESS_TYPE_OPTIONS = [
  "Cafeteria",
  "Restaurante",
  "Barberia",
  "Pet Shop",
  "Panaderia",
  "Heladeria",
  "Bar",
  "Tienda de ropa",
  "Gimnasio",
  "Spa",
  "Otro",
] as const

/* ────────────────────────────────────────────────────────────
   Tenant Detail Modal — tabbed layout with KPIs, info & actions
   ──────────────────────────────────────────────────────────── */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tabbed modal with 6 tabs, each containing forms and conditional UI — splitting into separate tab components would add complexity without improving readability
function TenantDetailModal({
  tenant,
  defaultTab = "general",
  onClose,
  onActionComplete,
  onOpenPlanModal,
}: {
  tenant: ApiTenant
  defaultTab?: string
  onClose: () => void
  onActionComplete: () => void
  onOpenPlanModal: (tenantId: string, action: PlanModalAction) => void
}) {
  const status = tenant.status
  const cfg = statusConfig[status] ?? statusConfig.active
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [promotions, setPromotions] = useState<TenantPromotion[]>([])
  const [promotionLoading, setPromotionLoading] = useState(true)
  const [promoDialogOpen, setPromoDialogOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<TenantPromotion | null>(null)
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [saving, setSaving] = useState(false)
  const [regConfig, setRegConfig] = useState<unknown>(null)
  const [regConfigLoading, setRegConfigLoading] = useState(true)

  // Location (sucursal) state
  const [saLocations, setSaLocations] = useState<
    Array<{ id: string; name: string; address: string | null; active: boolean }>
  >([])
  const [saLocLoading, setSaLocLoading] = useState(true)
  const [saLocName, setSaLocName] = useState("")
  const [saLocAddress, setSaLocAddress] = useState("")
  const [saLocSaving, setSaLocSaving] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: tenant.name,
    businessType: tenant.businessType ?? "",
    address: tenant.address ?? "",
    phone: tenant.phone ?? "",
    contactEmail: tenant.contactEmail ?? "",
    timezone: tenant.timezone ?? "America/Lima",
  })

  // Segmentation config state
  const businessTypeDefaults = getThresholds(tenant.businessType)
  const [segForm, setSegForm] = useState<Partial<SegmentationThresholds>>({
    frequentMaxDays: tenant.segmentationConfig?.frequentMaxDays ?? undefined,
    oneTimeInactiveDays: tenant.segmentationConfig?.oneTimeInactiveDays ?? undefined,
    riskMultiplier: tenant.segmentationConfig?.riskMultiplier ?? undefined,
    newClientDays: tenant.segmentationConfig?.newClientDays ?? undefined,
  })
  const [savingSeg, setSavingSeg] = useState(false)

  const handleSaveSegmentation = async () => {
    setSavingSeg(true)
    // Build config: only include fields that differ from defaults (i.e. have an explicit override)
    const hasOverrides = Object.values(segForm).some((v) => v != null)
    const configPayload = hasOverrides ? segForm : null

    const result = await patchTenant(tenant.id, {
      segmentationConfig: configPayload,
    })
    setSavingSeg(false)
    if (result.ok) {
      toast.success("Configuracion de segmentacion guardada")
      onActionComplete()
    } else {
      toast.error(result.error ?? "Error al guardar segmentacion")
    }
  }

  const handleResetSegmentation = async () => {
    setSegForm({})
    setSavingSeg(true)
    const result = await patchTenant(tenant.id, {
      segmentationConfig: null,
    })
    setSavingSeg(false)
    if (result.ok) {
      toast.success("Segmentacion restaurada a valores por defecto")
      onActionComplete()
    } else {
      toast.error(result.error ?? "Error al restaurar segmentacion")
    }
  }

  const registroUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/${tenant.slug}/registro`

  // Fetch admin email on mount
  useEffect(() => {
    if (!tenant.ownerId) return
    fetch(`/api/admin/tenants/${tenant.id}/admin-info`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.email) setAdminEmail(data.data.email)
      })
      .catch(() => {})
  }, [tenant.id, tenant.ownerId])

  // Fetch promotion, registration config, and locations via API
  const refreshTenantDetails = useCallback(() => {
    setPromotionLoading(true)
    setRegConfigLoading(true)
    setSaLocLoading(true)
    fetch(`/api/admin/tenants/${tenant.id}/details`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.promotions && Array.isArray(json.data.promotions)) {
          setPromotions(
            json.data.promotions.map((p: Record<string, unknown>) => ({
              id: p.id as string,
              type: p.type as string,
              maxVisits: p.maxVisits as number | null,
              rewardValue: p.rewardValue as string | null,
              active: p.active as boolean,
              config: p.config,
              passDesignId: (p.passDesignId as string | null) ?? null,
            })),
          )
        } else {
          setPromotions([])
        }
        setRegConfig(json?.data?.registrationConfig ?? null)
        setSaLocations(json?.data?.locations ?? [])
      })
      .catch(() => {
        setPromotions([])
        setRegConfig(null)
        setSaLocations([])
      })
      .finally(() => {
        setPromotionLoading(false)
        setRegConfigLoading(false)
        setSaLocLoading(false)
      })
  }, [tenant.id])

  useEffect(() => {
    refreshTenantDetails()
  }, [refreshTenantDetails])

  const _activePromotion = promotions.find((p) => p.active) ?? null

  const handlePromoDialogClose = (open: boolean) => {
    setPromoDialogOpen(open)
    if (!open) {
      refreshTenantDetails()
    }
  }

  const handleTogglePromo = async (promoId: string, active: boolean) => {
    if (active && !window.confirm("Activar esta promocion desactivara las demas. Continuar?")) {
      return
    }
    const result = await togglePromotionActive(promoId, active)
    if (result.success) {
      toast.success(active ? "Promocion activada" : "Promocion desactivada")
      refreshTenantDetails()
    } else {
      toast.error(result.error)
    }
  }

  // Location CRUD handlers
  const handleAddSaLocation = async () => {
    if (!saLocName.trim()) return
    setSaLocSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saLocName, address: saLocAddress }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setSaLocations((prev) => [...prev, json.data])
        setSaLocName("")
        setSaLocAddress("")
        toast.success("Sucursal agregada")
      } else {
        toast.error(json.error ?? "Error al agregar sucursal")
      }
    } catch {
      toast.error("Error de conexion")
    } finally {
      setSaLocSaving(false)
    }
  }

  const handleDeleteSaLocation = async (locationId: string) => {
    setSaLocSaving(true)
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenant.id}/locations?locationId=${locationId}`,
        { method: "DELETE" },
      )
      if (res.ok) {
        setSaLocations((prev) => prev.filter((l) => l.id !== locationId))
        toast.success("Sucursal eliminada")
      } else {
        const json = await res.json()
        toast.error(json.error ?? "Error al eliminar")
      }
    } catch {
      toast.error("Error de conexion")
    } finally {
      setSaLocSaving(false)
    }
  }

  const handleToggleSaLocation = async (locationId: string, active: boolean) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/locations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, active }),
      })
      if (res.ok) {
        setSaLocations((prev) => prev.map((l) => (l.id === locationId ? { ...l, active } : l)))
      } else {
        const json = await res.json()
        toast.error(json.error ?? "Error al actualizar")
      }
    } catch {
      toast.error("Error de conexion")
    }
  }

  // Check if action should delegate to plan modal
  const delegateToPlanModal = (action: string): boolean => {
    if (action === "Activar con plan") {
      onOpenPlanModal(tenant.id, "activate")
      return true
    }
    if (action === "Cambiar plan") {
      onOpenPlanModal(tenant.id, "change")
      return true
    }
    const needsReactivation =
      (action === "Reactivar" || action === "Reactivar con plan") &&
      (status === "expired" || status === "cancelled")
    if (needsReactivation) {
      onOpenPlanModal(tenant.id, "reactivate")
      return true
    }
    return false
  }

  // Confirm destructive actions — returns false if user cancelled
  const confirmDestructive = (action: string): boolean => {
    if (action === "Desactivar" || action === "Desactivar definitivamente") {
      return window.confirm(
        `Seguro que deseas desactivar "${tenant.name}"? Esta accion cambiara su estado a cancelado.`,
      )
    }
    if (action === "Pausar") {
      return window.confirm(
        `Seguro que deseas pausar "${tenant.name}"? El comercio no podra operar hasta que se reactive.`,
      )
    }
    return true
  }

  // Build PATCH payload from action string
  const buildPayload = (action: string): Record<string, unknown> | null => {
    switch (action) {
      case "Activar con demo": {
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + 7)
        return { status: "trial", trialEndsAt: trialEnd.toISOString() }
      }
      case "Extender demo": {
        const newEnd = new Date(tenant.trialEndsAt ?? new Date())
        newEnd.setDate(newEnd.getDate() + 7)
        return { trialEndsAt: newEnd.toISOString() }
      }
      case "Pausar":
        return { status: "paused" }
      case "Desactivar":
      case "Desactivar definitivamente":
        return { status: "cancelled" }
      case "Reactivar":
        return { status: "active" }
      default:
        return null
    }
  }

  const handleAction = async (action: string) => {
    if (delegateToPlanModal(action)) return
    if (!confirmDestructive(action)) return

    const payload = buildPayload(action)
    if (!payload) return

    setActionLoading(action)
    const result = await patchTenant(tenant.id, payload)
    setActionLoading(null)

    if (result.ok) {
      toast.success(`"${tenant.name}" actualizado correctamente`)
      onActionComplete()
    } else {
      toast.error(result.error ?? "Error al actualizar tenant")
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleResetPassword = async () => {
    if (!tenant.ownerId) return
    setResettingPassword(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/reset-password`, { method: "POST" })
      const data = await res.json()
      if (res.ok && data.data?.tempPassword) {
        setNewPassword(data.data.tempPassword)
      }
    } catch {
      // ignore
    } finally {
      setResettingPassword(false)
    }
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    const result = await patchTenant(tenant.id, {
      name: editForm.name,
      businessType: editForm.businessType || undefined,
      address: editForm.address || undefined,
      phone: editForm.phone || undefined,
      contactEmail: editForm.contactEmail || undefined,
      timezone: editForm.timezone,
    })
    setSaving(false)
    if (result.ok) {
      toast.success("Tenant actualizado")
      onActionComplete()
    } else {
      toast.error(result.error ?? "Error al actualizar")
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "\u2014"
    return new Date(dateStr).toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const isLoading = actionLoading !== null

  const ActionButton = ({
    action,
    children,
    ...props
  }: {
    action: string
    children: React.ReactNode
  } & React.ComponentProps<typeof Button>) => (
    <Button {...props} disabled={isLoading || props.disabled} onClick={() => handleAction(action)}>
      {actionLoading === action ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
      {children}
    </Button>
  )

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onPointerDown={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header — always visible above tabs */}
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{tenant.name}</h3>
              <p className="text-sm text-slate-500">{tenant.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs border ${cfg.color}`}>{cfg.label}</Badge>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 ml-2"
              >
                &#10005;
              </button>
            </div>
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="px-6">
            <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none p-0 h-auto">
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0e70db] data-[state=active]:text-[#0e70db] data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                value="general"
              >
                General
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0e70db] data-[state=active]:text-[#0e70db] data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                value="promocion"
              >
                Promocion
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0e70db] data-[state=active]:text-[#0e70db] data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                value="registro"
              >
                Registro
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0e70db] data-[state=active]:text-[#0e70db] data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                value="segmentacion"
              >
                Segmentacion
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0e70db] data-[state=active]:text-[#0e70db] data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                value="apple"
              >
                Apple
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0e70db] data-[state=active]:text-[#0e70db] data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                value="editar"
              >
                Editar
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Tab: General ────────────────────────────────── */}
          <TabsContent
            value="general"
            forceMount
            className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
          >
            <div className="p-6 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "Clientes",
                    value: Number(tenant.clientCount).toLocaleString(),
                    icon: Users,
                  },
                  {
                    label: "Visitas",
                    value: Number(tenant.visitCount).toLocaleString(),
                    icon: BarChart3,
                  },
                  {
                    label: "Rewards canjeados",
                    value: Number(tenant.rewardCount).toLocaleString(),
                    icon: Gift,
                  },
                  {
                    label: "Tasa de retorno",
                    value: `${Number(tenant.returnRate)}%`,
                    icon: RefreshCw,
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <kpi.icon className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs text-slate-500 mb-0.5">{kpi.label}</div>
                    <div className="font-bold text-slate-900 text-sm">{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Info section */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Plan actual</span>
                  <span className="font-medium text-slate-900">
                    {tenant.planName ?? "Sin plan"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha de activacion</span>
                  <span className="font-medium text-slate-900">
                    {formatDate(tenant.activatedAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Demo expira</span>
                  <span className="font-medium text-slate-900">
                    {formatDate(tenant.trialEndsAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Slug</span>
                  <span className="font-medium text-slate-900 text-xs">{tenant.slug}</span>
                </div>
              </div>

              {/* Quick access links */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Accesos rapidos
                </p>

                {/* Registration link */}
                <div className="bg-blue-50 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#0e70db]" />
                      <span className="text-xs font-medium text-slate-700">
                        Link de registro para clientes
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-[#0e70db] hover:text-[#0c5fb8]"
                      onClick={() => copyToClipboard(registroUrl, "registro")}
                    >
                      {copiedField === "registro" ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Copiado
                        </>
                      ) : (
                        "Copiar"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate">{registroUrl}</p>
                </div>

                {/* Admin credentials */}
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-medium text-slate-700">
                      Credenciales del admin
                    </span>
                  </div>
                  {adminEmail ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          Email: <span className="font-mono text-slate-900">{adminEmail}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyToClipboard(adminEmail, "email")}
                        >
                          {copiedField === "email" ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Copiado
                            </>
                          ) : (
                            "Copiar"
                          )}
                        </Button>
                      </div>
                      {newPassword ? (
                        <div className="flex items-center justify-between bg-amber-50 rounded-lg p-2">
                          <span className="text-xs text-slate-500">
                            Nueva contrasena:{" "}
                            <span className="font-mono font-bold text-slate-900">
                              {newPassword}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => copyToClipboard(newPassword, "password")}
                          >
                            {copiedField === "password" ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Copiado
                              </>
                            ) : (
                              "Copiar"
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 h-7"
                          onClick={handleResetPassword}
                          disabled={resettingPassword}
                        >
                          {resettingPassword ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" /> Reseteando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3" /> Resetear contrasena
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {tenant.ownerId ? "Cargando..." : "Sin admin asignado"}
                    </p>
                  )}
                </div>
              </div>

              {/* Contextual actions based on status */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Acciones
                </p>

                {status === "trial" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      action="Activar con plan"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                    >
                      <CreditCard className="w-3 h-3" /> Activar con plan
                    </ActionButton>
                    <ActionButton
                      action="Extender demo"
                      size="sm"
                      variant="outline"
                      className="text-blue-600 border-blue-200 text-xs gap-1"
                    >
                      <Calendar className="w-3 h-3" /> Extender demo
                    </ActionButton>
                  </div>
                )}

                {status === "active" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      action="Pausar"
                      size="sm"
                      variant="outline"
                      className="text-amber-600 border-amber-200 text-xs gap-1"
                    >
                      <Pause className="w-3 h-3" /> Pausar
                    </ActionButton>
                    <ActionButton
                      action="Cambiar plan"
                      size="sm"
                      variant="outline"
                      className="text-blue-600 border-blue-200 text-xs gap-1"
                    >
                      <ArrowRightLeft className="w-3 h-3" /> Cambiar plan
                    </ActionButton>
                    <ActionButton
                      action="Desactivar"
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 text-xs gap-1"
                    >
                      <Ban className="w-3 h-3" /> Desactivar
                    </ActionButton>
                  </div>
                )}

                {status === "expired" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      action="Reactivar"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                    >
                      <Play className="w-3 h-3" /> Reactivar
                    </ActionButton>
                    <ActionButton
                      action="Contactar"
                      size="sm"
                      variant="outline"
                      className="text-blue-600 border-blue-200 text-xs gap-1"
                    >
                      <Mail className="w-3 h-3" /> Contactar
                    </ActionButton>
                  </div>
                )}

                {status === "paused" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      action="Reactivar"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                    >
                      <Play className="w-3 h-3" /> Reactivar
                    </ActionButton>
                    <ActionButton
                      action="Desactivar definitivamente"
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 text-xs gap-1"
                    >
                      <Ban className="w-3 h-3" /> Desactivar definitivamente
                    </ActionButton>
                  </div>
                )}

                {status === "cancelled" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      action="Reactivar"
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200 text-xs gap-1"
                    >
                      <Play className="w-3 h-3" /> Reactivar
                    </ActionButton>
                  </div>
                )}

                {status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      action="Activar con demo"
                      size="sm"
                      className="bg-[#0e70db] text-white text-xs gap-1"
                    >
                      <Zap className="w-3 h-3" /> Activar con demo
                    </ActionButton>
                    <ActionButton
                      action="Activar con plan"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                    >
                      <CreditCard className="w-3 h-3" /> Activar con plan
                    </ActionButton>
                  </div>
                )}

                {/* Common actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 bg-[#0e70db] text-white text-xs"
                    onClick={() => window.open(`/${tenant.slug}/registro`, "_blank")}
                  >
                    Ver registro
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => window.open(`/admin/pases?tenant=${tenant.id}`, "_self")}
                  >
                    Editar pase
                  </Button>
                </div>
              </div>

              {/* ── Sucursales ─────────────────────────────────── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Sucursales
                </p>

                {saLocLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
                  </div>
                ) : (
                  <>
                    {saLocations.length === 0 && (
                      <p className="text-xs text-slate-400 italic">Sin sucursales</p>
                    )}
                    {saLocations.map((loc) => (
                      <div
                        key={loc.id}
                        className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{loc.name}</div>
                          {loc.address && (
                            <div className="text-xs text-slate-500 truncate">{loc.address}</div>
                          )}
                        </div>
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                          <input
                            type="checkbox"
                            checked={loc.active}
                            onChange={(e) => handleToggleSaLocation(loc.id, e.target.checked)}
                            className="rounded"
                          />
                          Activa
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteSaLocation(loc.id)}
                          disabled={saLocSaving}
                          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500">Nombre</Label>
                        <Input
                          value={saLocName}
                          onChange={(e) => setSaLocName(e.target.value)}
                          placeholder="Sucursal Centro"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500">Direccion</Label>
                        <Input
                          value={saLocAddress}
                          onChange={(e) => setSaLocAddress(e.target.value)}
                          placeholder="Av. Ejemplo 1234"
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddSaLocation}
                        disabled={saLocSaving || !saLocName.trim()}
                        className="h-8 text-xs gap-1"
                      >
                        {saLocSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3" />
                        )}
                        Agregar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Promocion ──────────────────────────────── */}
          <TabsContent
            value="promocion"
            forceMount
            className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
          >
            <div className="p-6 space-y-4">
              {/* Header with create button */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Promociones
                </p>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs gap-1 bg-[#0e70db] text-white"
                  onClick={() => {
                    setEditingPromo(null)
                    setPromoDialogOpen(true)
                  }}
                >
                  <Plus className="w-3 h-3" /> Nueva promocion
                </Button>
              </div>

              {/* Loading */}
              {promotionLoading && (
                <div className="flex items-center gap-2 py-3">
                  <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-500">Cargando...</span>
                </div>
              )}

              {/* Empty state */}
              {!promotionLoading && promotions.length === 0 && (
                <div className="text-center py-8 text-sm text-slate-400">
                  Sin promociones configuradas
                </div>
              )}

              {/* Promotion list */}
              {promotions.map((promo) => (
                <div
                  key={promo.id}
                  className={`rounded-xl border p-4 space-y-2 ${
                    promo.active
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {promo.type === "points" ? (
                        <TrendingUp className="w-4 h-4 text-[#0e70db]" />
                      ) : (
                        <Stamp className="w-4 h-4 text-[#0e70db]" />
                      )}
                      <span className="text-sm font-medium">
                        {promo.rewardValue || (promo.type === "points" ? "Puntos" : "Sellos")}
                      </span>
                      <Badge className="text-[10px] border bg-slate-100 text-slate-500 border-slate-200">
                        {promo.type === "points" ? "Puntos" : "Sellos"}
                      </Badge>
                      <Badge
                        className={`text-[10px] border ${
                          promo.active
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {promo.active ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Open pass editor */}
                      {promo.passDesignId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          title="Editar pase"
                          onClick={() =>
                            window.open(`/admin/pases/${promo.passDesignId}/editor`, "_self")
                          }
                        >
                          <Paintbrush className="w-3 h-3" />
                        </Button>
                      )}
                      {/* Toggle active */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleTogglePromo(promo.id, !promo.active)}
                      >
                        {promo.active ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </Button>
                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditingPromo(promo)
                          setPromoDialogOpen(true)
                        }}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Details row */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {promo.type === "points" ? (
                      <>
                        <div>
                          <span className="text-slate-500">Pts/Sol:</span>{" "}
                          <span className="font-medium text-slate-900">
                            {(() => {
                              const c = promo.config as Record<string, unknown> | null
                              const pts = c?.points as Record<string, unknown> | undefined
                              return String(pts?.pointsPerCurrency ?? "1")
                            })()}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Redondeo:</span>{" "}
                          <span className="font-medium text-slate-900">
                            {(() => {
                              const c = promo.config as Record<string, unknown> | null
                              const pts = c?.points as Record<string, unknown> | undefined
                              const method = pts?.roundingMethod ?? "floor"
                              return method === "floor"
                                ? "Piso"
                                : method === "ceil"
                                  ? "Techo"
                                  : "Normal"
                            })()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-500">Visitas:</span>{" "}
                          <span className="font-medium text-slate-900">
                            {promo.maxVisits ?? "\u2014"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Premio:</span>{" "}
                          <span className="font-medium text-slate-900">
                            {promo.rewardValue ?? "\u2014"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Catalog section — visible if ANY points promotion exists (active or not) */}
              <CatalogSection
                tenantId={tenant.id}
                promotionType={promotions.some((p) => p.type === "points") ? "points" : null}
              />
            </div>

            {/* Promotion form dialog */}
            <PromotionFormDialog
              key={editingPromo?.id ?? "new"}
              open={promoDialogOpen}
              onOpenChange={handlePromoDialogClose}
              tenantId={tenant.id}
              promotion={editingPromo}
            />
          </TabsContent>

          {/* ── Tab: Registro ───────────────────────────────── */}
          <TabsContent
            value="registro"
            forceMount
            className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
          >
            <div className="pb-6">
              <RegistrationConfigSection
                tenantId={tenant.id}
                initialConfig={
                  regConfig as import("@cuik/shared/validators").RegistrationConfig | null
                }
                loading={regConfigLoading}
                onRefresh={refreshTenantDetails}
              />
            </div>
          </TabsContent>

          {/* ── Tab: Segmentacion ──────────────────────────── */}
          <TabsContent
            value="segmentacion"
            forceMount
            className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
          >
            <div className="p-6 space-y-4">
              {/* Business type info */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tipo de negocio
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {tenant.businessType || "No definido"}
                </p>
                <p className="text-xs text-slate-400">
                  Los valores por defecto se ajustan segun el tipo de negocio.
                </p>
              </div>

              {/* Defaults reference */}
              <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  Valores por defecto (referencia)
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Frecuente max dias</span>
                    <span className="font-medium text-slate-700">
                      {businessTypeDefaults.frequentMaxDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Inactivo una visita</span>
                    <span className="font-medium text-slate-700">
                      {businessTypeDefaults.oneTimeInactiveDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Multiplicador riesgo</span>
                    <span className="font-medium text-slate-700">
                      {businessTypeDefaults.riskMultiplier}x
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dias cliente nuevo</span>
                    <span className="font-medium text-slate-700">
                      {businessTypeDefaults.newClientDays}
                    </span>
                  </div>
                </div>
              </div>

              {/* Override inputs */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Sobreescribir umbrales (dejar vacio para usar defaults)
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="seg-frequentMaxDays" className="text-xs text-slate-600">
                      Frecuente max dias
                    </Label>
                    <Input
                      id="seg-frequentMaxDays"
                      type="number"
                      min={1}
                      placeholder={String(businessTypeDefaults.frequentMaxDays)}
                      value={segForm.frequentMaxDays ?? ""}
                      onChange={(e) =>
                        setSegForm((prev) => ({
                          ...prev,
                          frequentMaxDays: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="seg-oneTimeInactiveDays" className="text-xs text-slate-600">
                      Inactivo una visita (dias)
                    </Label>
                    <Input
                      id="seg-oneTimeInactiveDays"
                      type="number"
                      min={1}
                      placeholder={String(businessTypeDefaults.oneTimeInactiveDays)}
                      value={segForm.oneTimeInactiveDays ?? ""}
                      onChange={(e) =>
                        setSegForm((prev) => ({
                          ...prev,
                          oneTimeInactiveDays: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="seg-riskMultiplier" className="text-xs text-slate-600">
                      Multiplicador riesgo
                    </Label>
                    <Input
                      id="seg-riskMultiplier"
                      type="number"
                      min={1}
                      step={0.5}
                      placeholder={String(businessTypeDefaults.riskMultiplier)}
                      value={segForm.riskMultiplier ?? ""}
                      onChange={(e) =>
                        setSegForm((prev) => ({
                          ...prev,
                          riskMultiplier: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="seg-newClientDays" className="text-xs text-slate-600">
                      Dias cliente nuevo
                    </Label>
                    <Input
                      id="seg-newClientDays"
                      type="number"
                      min={1}
                      placeholder={String(businessTypeDefaults.newClientDays)}
                      value={segForm.newClientDays ?? ""}
                      onChange={(e) =>
                        setSegForm((prev) => ({
                          ...prev,
                          newClientDays: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleSaveSegmentation}
                  disabled={savingSeg}
                  className="flex-1 bg-[#0e70db] hover:bg-[#0c5fb8]"
                >
                  {savingSeg ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetSegmentation}
                  disabled={savingSeg}
                >
                  Usar defaults
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Apple ──────────────────────────────────── */}
          <TabsContent
            value="apple"
            forceMount
            className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
          >
            <div className="p-6">
              <AppleCertWizard tenantId={tenant.id} tenantSlug={tenant.slug} />
            </div>
          </TabsContent>

          {/* ── Tab: Editar ─────────────────────────────────── */}
          <TabsContent
            value="editar"
            forceMount
            className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
          >
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs font-medium text-slate-700">
                    Nombre
                  </Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-business-type"
                    className="text-xs font-medium text-slate-700"
                  >
                    Tipo de negocio
                  </Label>
                  <select
                    id="edit-business-type"
                    value={editForm.businessType}
                    onChange={(e) => setEditForm((f) => ({ ...f, businessType: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#0e70db] focus:border-transparent"
                  >
                    <option value="">Seleccionar...</option>
                    {BUSINESS_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-address" className="text-xs font-medium text-slate-700">
                    Direccion
                  </Label>
                  <Input
                    id="edit-address"
                    value={editForm.address}
                    onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="Av. Ejemplo 123, Lima"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone" className="text-xs font-medium text-slate-700">
                    Telefono
                  </Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="+51 999 888 777"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-contact-email"
                    className="text-xs font-medium text-slate-700"
                  >
                    Email de contacto
                  </Label>
                  <Input
                    id="edit-contact-email"
                    type="email"
                    value={editForm.contactEmail}
                    onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="contacto@negocio.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-timezone" className="text-xs font-medium text-slate-700">
                    Zona horaria
                  </Label>
                  <select
                    id="edit-timezone"
                    value={editForm.timezone}
                    onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#0e70db] focus:border-transparent"
                  >
                    <option value="America/Lima">America/Lima (UTC-5)</option>
                    <option value="America/Bogota">America/Bogota (UTC-5)</option>
                    <option value="America/Mexico_City">America/Mexico_City (UTC-6)</option>
                    <option value="America/Santiago">America/Santiago (UTC-3/-4)</option>
                    <option value="America/Argentina/Buenos_Aires">
                      America/Buenos_Aires (UTC-3)
                    </option>
                    <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</option>
                    <option value="America/Caracas">America/Caracas (UTC-4)</option>
                    <option value="America/Guayaquil">America/Guayaquil (UTC-5)</option>
                    <option value="America/Panama">America/Panama (UTC-5)</option>
                    <option value="America/Costa_Rica">America/Costa_Rica (UTC-6)</option>
                    <option value="America/Guatemala">America/Guatemala (UTC-6)</option>
                    <option value="America/New_York">America/New_York (UTC-5/-4)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (UTC-8/-7)</option>
                    <option value="Europe/Madrid">Europe/Madrid (UTC+1/+2)</option>
                  </select>
                </div>
              </div>

              <Button
                className="w-full bg-[#0e70db] text-white text-sm gap-2"
                onClick={handleSaveEdit}
                disabled={saving || !editForm.name.trim()}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar cambios
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Plan Selection Modal — fetches real plans from API
   ──────────────────────────────────────────────────────────── */
function PlanSelectionModal({
  tenantName,
  currentPlanId,
  action,
  onClose,
  onConfirm,
}: {
  tenantName: string
  currentPlanId: string | null
  action: PlanModalAction
  onClose: () => void
  onConfirm: (planId: string) => void
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [plans, setPlans] = useState<ApiPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setLoadingPlans(true)
    setPlansError(null)
    fetch("/api/admin/plans")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return res.json()
      })
      .then((json) => {
        setPlans(json.data)
      })
      .catch((err) => {
        setPlansError(err instanceof Error ? err.message : "Error al cargar planes")
      })
      .finally(() => {
        setLoadingPlans(false)
      })
  }, [])

  const title =
    action === "activate"
      ? "Activar con Plan"
      : action === "change"
        ? "Cambiar Plan"
        : "Reactivar con Plan"

  const handleConfirm = async () => {
    if (!selectedPlan) return
    setConfirming(true)
    onConfirm(selectedPlan)
  }

  const isChangePlan = action === "change"

  return (
    // biome-ignore lint/a11y/useSemanticElements: modal backdrop overlay requires div for click-to-dismiss
    <div
      role="button"
      tabIndex={0}
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <div
        role="dialog"
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500">
                Selecciona un plan para <strong>{tenantName}</strong>
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              &#10005;
            </button>
          </div>
        </div>
        <div className="p-6 space-y-3">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">Cargando planes...</span>
            </div>
          ) : plansError ? (
            <div className="text-center py-8">
              <XCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600">{plansError}</p>
            </div>
          ) : (
            plans.map((plan) => {
              const isCurrent = isChangePlan && plan.id === currentPlanId
              return (
                <button
                  type="button"
                  key={plan.id}
                  onClick={() => !isCurrent && setSelectedPlan(plan.id)}
                  disabled={isCurrent}
                  className={`w-full text-left rounded-xl p-4 border-2 transition-colors ${
                    isCurrent
                      ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                      : selectedPlan === plan.id
                        ? "border-[#0e70db] bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{plan.name}</span>
                      {isCurrent && (
                        <Badge className="text-[10px] bg-slate-200 text-slate-600 border-0">
                          Plan actual
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {plan.maxClients.toLocaleString()} clientes, {plan.maxLocations} locales,{" "}
                    {plan.maxPromos} promos
                  </p>
                </button>
              )
            })
          )}
        </div>
        <div className="p-6 pt-0 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            disabled={!selectedPlan || loadingPlans || confirming}
            onClick={handleConfirm}
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Main Page
   ──────────────────────────────────────────────────────────── */
export default function TenantsPage() {
  const [tenants, setTenants] = useState<ApiTenant[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedTenant, setSelectedTenant] = useState<ApiTenant | null>(null)
  const [defaultTab, setDefaultTab] = useState<string>("general")
  const [planModalContext, setPlanModalContext] = useState<{
    tenantId: string
    tenantName: string
    currentPlanId: string | null
    action: PlanModalAction
  } | null>(null)

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("")
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

  const handleActionComplete = () => {
    fetchTenants()
    // Don't close the modal — let the user close it manually
  }

  const handleOpenPlanModal = (tenantId: string, action: PlanModalAction) => {
    const tenant = tenants.find((t) => t.id === tenantId)
    if (!tenant) return
    setPlanModalContext({
      tenantId,
      tenantName: tenant.name,
      currentPlanId: tenant.planId,
      action,
    })
  }

  const handlePlanConfirm = async (planId: string) => {
    if (!planModalContext) return

    const payload: Record<string, unknown> = { planId }

    // Set status based on action
    if (planModalContext.action === "activate") {
      payload.status = "active"
    } else if (planModalContext.action === "reactivate") {
      payload.status = "active"
    }
    // "change" — only planId, no status change

    const result = await patchTenant(planModalContext.tenantId, payload)

    if (result.ok) {
      toast.success(`"${planModalContext.tenantName}" actualizado correctamente`)
      setPlanModalContext(null)
      handleActionComplete()
    } else {
      toast.error(result.error ?? "Error al actualizar tenant")
    }
  }

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
      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          defaultTab={defaultTab}
          onClose={() => setSelectedTenant(null)}
          onActionComplete={handleActionComplete}
          onOpenPlanModal={handleOpenPlanModal}
        />
      )}
      {planModalContext && (
        <PlanSelectionModal
          tenantName={planModalContext.tenantName}
          currentPlanId={planModalContext.currentPlanId}
          action={planModalContext.action}
          onClose={() => setPlanModalContext(null)}
          onConfirm={handlePlanConfirm}
        />
      )}

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
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-9 h-8 text-xs w-48"
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
                  className="h-8 pl-8 pr-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0e70db] focus:border-transparent appearance-none cursor-pointer"
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 text-left font-semibold">Tenant</th>
                    <th className="pb-2 text-left font-semibold">Estado</th>
                    <th className="pb-2 text-right font-semibold">Clientes</th>
                    <th className="pb-2 text-right font-semibold">Visitas</th>
                    <th className="pb-2 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
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
                            <div className="font-medium text-slate-900">{t.name}</div>
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
                                onClick={() => {
                                  setDefaultTab("general")
                                  setSelectedTenant(t)
                                }}
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                title="Certificado Apple"
                                onClick={() => {
                                  setDefaultTab("apple")
                                  setSelectedTenant(t)
                                }}
                              >
                                <Shield className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setDefaultTab("editar")
                                  setSelectedTenant(t)
                                }}
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
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={pagination.page >= pagination.totalPages}
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
