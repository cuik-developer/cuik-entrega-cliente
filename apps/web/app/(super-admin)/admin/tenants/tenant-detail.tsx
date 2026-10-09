"use client"

import { describePointsRate, type PointsRate } from "@cuik/shared/validators"

import {
  ArrowRightLeft,
  Ban,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Edit,
  Eye,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  Link2,
  Loader2,
  type LucideIcon,
  Mail,
  Megaphone,
  Paintbrush,
  Pause,
  Play,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Shield,
  Stamp,
  StickyNote,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { StatusChip } from "@/components/admin/enterprise"
import { TenantLogo } from "@/components/admin/tenant-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { getThresholds } from "@/lib/loyalty/client-segments"
import { AppleCertWizard } from "./apple-cert-wizard"
import { CatalogSection } from "./catalog-section"
import {
  type OnboardingChecklist as ChecklistData,
  OnboardingChecklist,
} from "./onboarding-checklist"
import { togglePromotionActive } from "./promotion-actions"
import { PromotionFormDialog } from "./promotion-form-dialog"
import { RegistrationConfigSection } from "./registration-config-section"
import { TenantBillingSection } from "./tenant-billing-section"
import { TenantCampaignsSection } from "./tenant-campaigns-section"
import { TenantNotesSection } from "./tenant-notes-section"
import { type CatalogSummaryItem, TenantProgramSummary } from "./tenant-program-summary"
import {
  type ApiTenant,
  BUSINESS_TYPE_OPTIONS,
  openTenantPanel,
  type PlanModalAction,
  patchTenant,
  statusConfig,
  type TenantPromotion,
} from "./tenant-shared"

const SECTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "general", label: "Resumen", icon: LayoutDashboard },
  { value: "promocion", label: "Programa", icon: Gift },
  { value: "registro", label: "Registro", icon: ClipboardList },
  { value: "segmentacion", label: "Segmentación", icon: Users },
  { value: "campanas", label: "Campañas", icon: Megaphone },
  { value: "apple", label: "Apple", icon: Shield },
  { value: "facturacion", label: "Facturación", icon: Receipt },
  { value: "notas", label: "Notas", icon: StickyNote },
  { value: "editar", label: "Datos del negocio", icon: Building2 },
]

/** Logo from the tenant branding (set in Admin → Branding); initial as fallback. */

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one page with 7 sections, each a form with conditional UI; splitting per section is the next refactor step
export function TenantDetail({
  tenant,
  defaultTab = "general",
  forceTab = false,
  onActionComplete,
  onOpenPlanModal,
}: {
  tenant: ApiTenant
  /** Tab to open the first time (no tab remembered yet for this tenant). */
  defaultTab?: string
  /** Always open `defaultTab`, ignoring the remembered one (e.g. the Apple shortcut). */
  forceTab?: boolean
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
  const [reportKind, setReportKind] = useState<"weekly" | "monthly">("weekly")
  const [reportBusy, setReportBusy] = useState<"download" | "send" | null>(null)
  const [promotions, setPromotions] = useState<TenantPromotion[]>([])
  const [promotionLoading, setPromotionLoading] = useState(true)
  const [promoDialogOpen, setPromoDialogOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<TenantPromotion | null>(null)
  // Remember the last tab per tenant for this browser session, so reopening the
  // same tenant lands where you left it. `defaultTab` is only the first-time
  // landing; `forceTab` (Apple shortcut) ignores the memory.
  const tabStorageKey = `cuik.sa.tenantTab.${tenant.id}`
  const [activeTab, setActiveTabState] = useState(() => {
    if (forceTab) return defaultTab
    try {
      return window.sessionStorage.getItem(tabStorageKey) ?? defaultTab
    } catch {
      return defaultTab
    }
  })
  const setActiveTab = useCallback(
    (tab: string) => {
      setActiveTabState(tab)
      try {
        window.sessionStorage.setItem(tabStorageKey, tab)
      } catch {
        /* private mode / storage blocked: ignore */
      }
    },
    [tabStorageKey],
  )
  // Checklist shortcuts can point to a section inside a tab (e.g. Sucursales).
  const openTabSection = useCallback(
    (tab: string, anchor?: string) => {
      setActiveTab(tab)
      if (anchor) {
        window.setTimeout(() => {
          document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 60)
      }
    },
    [setActiveTab],
  )
  const [checklist, setChecklist] = useState<ChecklistData | null>(null)
  const [catalog, setCatalog] = useState<CatalogSummaryItem[]>([])
  const [notesCount, setNotesCount] = useState<number | null>(null)
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
        setChecklist((json?.data?.checklist as ChecklistData | undefined) ?? null)
        setCatalog(Array.isArray(json?.data?.catalog) ? json.data.catalog : [])
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
    <div className="space-y-3">
      {/* Header: identity + quick actions, always visible */}
      <div className="bg-ent-panel rounded-[4px] border border-ent-line px-4 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <TenantLogo branding={tenant.branding} name={tenant.name} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[17px] leading-6 font-semibold text-ent-fg truncate">
                  {tenant.name}
                </h1>
                <StatusChip tone={cfg.tone}>{cfg.label}</StatusChip>
              </div>
              <p className="text-[11.5px] text-ent-fg-3 truncate">
                <span className="text-ent-fg-2 font-medium">{tenant.planName ?? "Sin plan"}</span>
                {` · ${tenant.slug}`}
                {tenant.businessType ? ` · ${tenant.businessType}` : ""}
                {tenant.activatedAt ? ` · activo desde ${formatDate(tenant.activatedAt)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 gap-1 text-xs"
              title="Copiar link de registro para clientes"
              onClick={() => copyToClipboard(registroUrl, "registro-header")}
            >
              {copiedField === "registro-header" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              {copiedField === "registro-header" ? "Copiado" : "Link registro"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 gap-1 text-xs"
              title="Ver panel del comercio (solo lectura)"
              onClick={() => openTenantPanel(tenant.id)}
            >
              <Eye className="w-3.5 h-3.5" />
              Ver panel
            </Button>
          </div>
        </div>
      </div>

      {/* Sections: left nav on desktop, horizontal strip on phones */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-3">
        {/* Horizontal underline tabs, scrollable on phones */}
        <TabsList className="w-full h-auto justify-start items-stretch gap-0 bg-ent-panel rounded-[4px] border border-ent-line p-0 px-2 overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="flex-none gap-1.5 rounded-none border-0 border-b-2 border-b-transparent -mb-px px-3 h-9 text-[12.5px] text-ent-fg-2 whitespace-nowrap data-[state=active]:border-b-ent-accent data-[state=active]:text-ent-accent data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
            >
              <s.icon className="w-3.5 h-3.5 shrink-0" />
              {s.label}
              {s.value === "notas" && notesCount ? (
                <span className="text-[11px] text-ent-fg-3">{notesCount}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0 w-full">
          {/* ── Tab: General ────────────────────────────────── */}
          <TabsContent
            value="general"
            forceMount
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <div className="p-4 space-y-3">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border border-ent-line rounded-[4px] overflow-hidden">
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
                  <div
                    key={kpi.label}
                    className="px-3 py-2 min-w-0 border-ent-line [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0 odd:border-r sm:border-r sm:last:border-r-0"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 truncate">
                      <kpi.icon className="w-3 h-3 shrink-0" />
                      {kpi.label}
                    </div>
                    <div className="text-[18px] leading-6 font-semibold text-ent-fg tabular-nums">
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Program, service and demo, in one list */}
              <TenantProgramSummary
                tenant={tenant}
                promotions={promotions}
                promotionsLoading={promotionLoading}
                catalog={catalog}
                onOpenTab={setActiveTab}
                onSaved={onActionComplete}
              />

              {/* Onboarding checklist */}
              {checklist && (
                <OnboardingChecklist
                  checklist={checklist}
                  tenantId={tenant.id}
                  onOpenTab={openTabSection}
                />
              )}

              {/* Quick access links */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
                  Accesos rapidos
                </p>

                {/* Registration link */}
                <div className="bg-ent-accent-soft rounded-[4px] p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-ent-accent" />
                      <span className="text-xs font-medium text-ent-fg-2">
                        Link de registro para clientes
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-ent-accent hover:text-ent-accent"
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
                  <p className="text-xs text-ent-fg-3 font-mono truncate">{registroUrl}</p>
                </div>

                {/* Admin credentials */}
                <div className="bg-ent-panel-2 rounded-[4px] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-ent-fg-3" />
                    <span className="text-xs font-medium text-ent-fg-2">
                      Credenciales del admin
                    </span>
                  </div>
                  {adminEmail ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ent-fg-3">
                          Email: <span className="font-mono text-ent-fg">{adminEmail}</span>
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
                        <div className="flex items-center justify-between bg-amber-50 rounded-[4px] p-2">
                          <span className="text-xs text-ent-fg-3">
                            Nueva contrasena:{" "}
                            <span className="font-mono font-bold text-ent-fg">{newPassword}</span>
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
                    <p className="text-xs text-ent-fg-3">
                      {tenant.ownerId ? "Cargando..." : "Sin admin asignado"}
                    </p>
                  )}
                </div>
              </div>

              {/* Contextual actions based on status */}
              <div className="space-y-2">
                {/* Ver como el comercio (solo lectura, 1 hora) */}
                <div className="bg-ent-panel-2 rounded-[4px] p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ent-fg">Ver como el comercio</p>
                    <p className="text-xs text-ent-fg-3">
                      Abre su panel en solo lectura durante 1 hora, para ver lo mismo que ve el
                      admin.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => openTenantPanel(tenant.id)}
                  >
                    <Eye className="w-3 h-3" /> Abrir panel
                  </Button>
                </div>

                {/* Reporte periódico: descargar el Excel o enviármelo, sin tocar al comercio */}
                <div className="bg-ent-panel-2 rounded-[4px] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ent-fg">Reporte por correo</p>
                      <p className="text-xs text-ent-fg-3">
                        El último período cerrado, tal como lo recibe el comercio. No le llega a
                        nadie más ni cuenta como enviado.
                      </p>
                    </div>
                    <div className="flex rounded-[4px] border border-ent-line bg-white p-0.5 shrink-0">
                      {(["weekly", "monthly"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setReportKind(k)}
                          className={`px-2.5 py-1 text-xs rounded-md ${
                            reportKind === k
                              ? "bg-ent-accent text-white"
                              : "text-ent-fg-2 hover:bg-ent-panel-2"
                          }`}
                        >
                          {k === "weekly" ? "Semanal" : "Mensual"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={reportBusy !== null}
                      onClick={async () => {
                        setReportBusy("download")
                        try {
                          const res = await fetch(
                            `/api/admin/tenants/${tenant.id}/report?kind=${reportKind}`,
                          )
                          if (!res.ok) {
                            toast.error("No se pudo generar el Excel")
                            return
                          }
                          const blob = await res.blob()
                          const cd = res.headers.get("Content-Disposition") ?? ""
                          const name =
                            /filename="([^"]+)"/.exec(cd)?.[1] ??
                            `${tenant.slug}-${reportKind === "weekly" ? "semana" : "mes"}.xlsx`
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = name
                          a.click()
                          URL.revokeObjectURL(url)
                        } finally {
                          setReportBusy(null)
                        }
                      }}
                    >
                      {reportBusy === "download" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="w-3 h-3" />
                      )}
                      Descargar Excel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={reportBusy !== null}
                      onClick={async () => {
                        setReportBusy("send")
                        try {
                          const res = await fetch(`/api/admin/tenants/${tenant.id}/report`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ kind: reportKind }),
                          })
                          const json = await res.json().catch(() => null)
                          if (!res.ok) {
                            toast.error(json?.error ?? "No se pudo enviar el reporte")
                            return
                          }
                          toast.success(`Reporte enviado a ${json?.data?.to?.[0] ?? "tu correo"}`)
                        } finally {
                          setReportBusy(null)
                        }
                      }}
                    >
                      {reportBusy === "send" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Mail className="w-3 h-3" />
                      )}
                      Enviarme el reporte
                    </Button>
                  </div>
                </div>

                <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
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
                      className="bg-ent-accent text-white text-xs gap-1"
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
                    className="flex-1 bg-ent-accent text-white text-xs"
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
              <div id="sucursales" className="space-y-3 scroll-mt-4">
                <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Sucursales
                </p>

                {saLocLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando...
                  </div>
                ) : (
                  <>
                    {saLocations.length === 0 && (
                      <p className="text-xs text-ent-fg-3 italic">Sin sucursales</p>
                    )}
                    {saLocations.map((loc) => (
                      <div
                        key={loc.id}
                        className="flex items-center gap-2 p-2.5 bg-ent-panel-2 dark:bg-slate-800/50 rounded-[4px]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{loc.name}</div>
                          {loc.address && (
                            <div className="text-xs text-ent-fg-3 truncate">{loc.address}</div>
                          )}
                        </div>
                        <label className="flex items-center gap-1 text-xs text-ent-fg-3">
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
                          title="Eliminar sucursal"
                          aria-label="Eliminar sucursal"
                          className="p-1 rounded text-ent-fg-3 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-ent-fg-3">Nombre</Label>
                        <Input
                          value={saLocName}
                          onChange={(e) => setSaLocName(e.target.value)}
                          placeholder="Sucursal Centro"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-ent-fg-3">Direccion</Label>
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
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <div className="p-4 space-y-3">
              {/* Header with create button */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
                  Promociones
                </p>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs gap-1 bg-ent-accent text-white"
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
                  <Loader2 className="w-3 h-3 animate-spin text-ent-fg-3" />
                  <span className="text-xs text-ent-fg-3">Cargando...</span>
                </div>
              )}

              {/* Empty state */}
              {!promotionLoading && promotions.length === 0 && (
                <div className="text-center py-8 text-sm text-ent-fg-3">
                  Sin promociones configuradas
                </div>
              )}

              {/* Promotion list */}
              {promotions.map((promo) => (
                <div
                  key={promo.id}
                  className={`rounded-[4px] border p-4 space-y-2 ${
                    promo.active
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-ent-line bg-ent-panel-2"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {promo.type === "points" ? (
                        <TrendingUp className="w-4 h-4 text-ent-accent" />
                      ) : (
                        <Stamp className="w-4 h-4 text-ent-accent" />
                      )}
                      <span className="text-sm font-medium">
                        {promo.rewardValue || (promo.type === "points" ? "Puntos" : "Sellos")}
                      </span>
                      <Badge className="text-[10px] border bg-ent-panel-2 text-ent-fg-3 border-ent-line">
                        {promo.type === "points" ? "Puntos" : "Sellos"}
                      </Badge>
                      <Badge
                        className={`text-[10px] border ${
                          promo.active
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-ent-panel-2 text-ent-fg-2 border-ent-line"
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
                          aria-label="Editar pase"
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
                        title={promo.active ? "Pausar promocion" : "Activar promocion"}
                        aria-label={promo.active ? "Pausar promocion" : "Activar promocion"}
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
                        title="Editar promocion"
                        aria-label="Editar promocion"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {promo.type === "points" ? (
                      <>
                        <div>
                          <span className="text-ent-fg-3">Regla:</span>{" "}
                          <span className="font-medium text-ent-fg">
                            {(() => {
                              const c = promo.config as Record<string, unknown> | null
                              const pts = c?.points as Record<string, unknown> | undefined
                              return describePointsRate((pts ?? {}) as PointsRate)
                            })()}
                          </span>
                        </div>
                        <div>
                          <span className="text-ent-fg-3">Redondeo:</span>{" "}
                          <span className="font-medium text-ent-fg">
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
                          <span className="text-ent-fg-3">Visitas:</span>{" "}
                          <span className="font-medium text-ent-fg">
                            {promo.maxVisits ?? "\u2014"}
                          </span>
                        </div>
                        <div>
                          <span className="text-ent-fg-3">Premio:</span>{" "}
                          <span className="font-medium text-ent-fg">
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
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <div className="pb-6">
              <RegistrationConfigSection
                tenantId={tenant.id}
                initialConfig={
                  regConfig as import("@cuik/shared/validators").RegistrationConfig | null
                }
                loading={regConfigLoading}
                onRefresh={refreshTenantDetails}
                promotionType={
                  (promotions.find((p) => p.active)?.type as "stamps" | "points" | undefined) ??
                  null
                }
              />
            </div>
          </TabsContent>

          {/* ── Tab: Segmentacion ──────────────────────────── */}
          <TabsContent
            value="segmentacion"
            forceMount
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <div className="p-4 space-y-3">
              {/* Business type info */}
              <div className="bg-ent-panel-2 rounded-[4px] p-4 space-y-1">
                <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
                  Tipo de negocio
                </p>
                <p className="text-sm font-medium text-ent-fg">
                  {tenant.businessType || "No definido"}
                </p>
                <p className="text-xs text-ent-fg-3">
                  Los valores por defecto se ajustan segun el tipo de negocio.
                </p>
              </div>

              {/* Defaults reference */}
              <div className="bg-ent-accent-soft rounded-[4px] p-4 space-y-2">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  Valores por defecto (referencia)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ent-fg-3">Frecuente max dias</span>
                    <span className="font-medium text-ent-fg-2">
                      {businessTypeDefaults.frequentMaxDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ent-fg-3">Inactivo una visita</span>
                    <span className="font-medium text-ent-fg-2">
                      {businessTypeDefaults.oneTimeInactiveDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ent-fg-3">Multiplicador riesgo</span>
                    <span className="font-medium text-ent-fg-2">
                      {businessTypeDefaults.riskMultiplier}x
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ent-fg-3">Dias cliente nuevo</span>
                    <span className="font-medium text-ent-fg-2">
                      {businessTypeDefaults.newClientDays}
                    </span>
                  </div>
                </div>
              </div>

              {/* Override inputs */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">
                  Sobreescribir umbrales (dejar vacio para usar defaults)
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="seg-frequentMaxDays" className="text-xs text-ent-fg-2">
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
                    <Label htmlFor="seg-oneTimeInactiveDays" className="text-xs text-ent-fg-2">
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
                    <Label htmlFor="seg-riskMultiplier" className="text-xs text-ent-fg-2">
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
                    <Label htmlFor="seg-newClientDays" className="text-xs text-ent-fg-2">
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
                  className="flex-1 bg-ent-accent hover:bg-ent-accent/90"
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
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <div className="p-4 sm:p-6">
              <AppleCertWizard tenantId={tenant.id} tenantSlug={tenant.slug} />
            </div>
          </TabsContent>

          {/* ── Tab: Editar ─────────────────────────────────── */}
          <TabsContent
            value="editar"
            forceMount
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <div className="p-4 space-y-3">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs font-medium text-ent-fg-2">
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
                  <Label htmlFor="edit-business-type" className="text-xs font-medium text-ent-fg-2">
                    Tipo de negocio
                  </Label>
                  <select
                    id="edit-business-type"
                    value={editForm.businessType}
                    onChange={(e) => setEditForm((f) => ({ ...f, businessType: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-ent-line bg-white px-3 py-1 text-sm text-ent-fg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ent-accent focus:border-transparent"
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
                  <Label htmlFor="edit-address" className="text-xs font-medium text-ent-fg-2">
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
                  <Label htmlFor="edit-phone" className="text-xs font-medium text-ent-fg-2">
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
                  <Label htmlFor="edit-contact-email" className="text-xs font-medium text-ent-fg-2">
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
                  <Label htmlFor="edit-timezone" className="text-xs font-medium text-ent-fg-2">
                    Zona horaria
                  </Label>
                  <select
                    id="edit-timezone"
                    value={editForm.timezone}
                    onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-ent-line bg-white px-3 py-1 text-sm text-ent-fg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ent-accent focus:border-transparent"
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
                className="w-full bg-ent-accent text-white text-sm gap-2"
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
          {/* ── Tab: Facturación ───────────────────────────── */}
          <TabsContent
            value="facturacion"
            forceMount
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <TenantBillingSection tenantId={tenant.id} tenantName={tenant.name} />
          </TabsContent>
          {/* ── Tab: Notas internas ────────────────────────── */}
          <TabsContent
            value="campanas"
            className="bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <TenantCampaignsSection tenantId={tenant.id} />
          </TabsContent>

          <TabsContent
            value="notas"
            forceMount
            className="data-[state=inactive]:hidden bg-ent-panel rounded-[4px] border border-ent-line"
          >
            <TenantNotesSection tenantId={tenant.id} onCountChange={setNotesCount} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
