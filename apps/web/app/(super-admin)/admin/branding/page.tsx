"use client"

import type { TenantBranding } from "@cuik/shared/validators"
import {
  BarChart3,
  Bell,
  CreditCard,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Palette,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

import {
  getBranding,
  getPublishedPassColors,
  listTenantsForBranding,
  saveBranding,
} from "./actions"

// ── Constants ───────────────────────────────────────────────────────

const DEFAULT_PRIMARY = "#0e70db"
const DEFAULT_ACCENT = "#ff4810"
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

// ── Types ───────────────────────────────────────────────────────────

interface TenantOption {
  id: string
  businessName: string
  slug: string
  status: string
  branding: TenantBranding | null
}

interface FormState {
  primaryColor: string
  accentColor: string
  logoUrl: string | null
}

interface Suggestions {
  suggestedPrimary: string
  suggestedAccent: string
}

// ── Helpers ─────────────────────────────────────────────────────────

function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value)
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

function contrastText(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? "#1e293b" : "#f8fafc"
}

// ── Color Picker ────────────────────────────────────────────────────

function ColorPicker({
  label,
  value,
  onChange,
  suggestion,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suggestion?: string | null
}) {
  const [hexInput, setHexInput] = useState(value)

  useEffect(() => {
    setHexInput(value)
  }, [value])

  function handleHexBlur() {
    if (isValidHex(hexInput)) {
      onChange(hexInput.toLowerCase())
    } else {
      setHexInput(value)
    }
  }

  function handleHexKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleHexBlur()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-slate-600 text-xs font-semibold uppercase tracking-wide">
          {label}
        </Label>
        {suggestion && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-600 bg-blue-50/60"
          >
            <Sparkles className="w-2.5 h-2.5 mr-0.5" />
            Sugerido del pase
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="relative cursor-pointer group" aria-label={`Elegir ${label}`}>
          <div
            className="w-11 h-11 rounded-lg shadow-sm ring-1 ring-slate-200/80 transition-shadow group-hover:ring-2 group-hover:ring-slate-300"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            tabIndex={-1}
          />
        </label>
        <Input
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={handleHexKeyDown}
          maxLength={7}
          className="font-mono text-sm w-28 tracking-wider"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

// ── Logo Upload ─────────────────────────────────────────────────────

function LogoUploader({
  logoUrl,
  tenantId,
  onUpload,
  onRemove,
}: {
  logoUrl: string | null
  tenantId: string
  onUpload: (url: string) => void
  onRemove: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imagenes (PNG, JPG, SVG)")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo no puede superar 2MB")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("tenantId", tenantId)
      formData.append("assetType", "logo")

      const res = await fetch("/api/admin/assets/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Upload failed")
      }

      const data = await res.json()
      onUpload(data.data.url)
      toast.success("Logo subido correctamente")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir el logo")
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  if (logoUrl) {
    return (
      <div className="space-y-2">
        <Label className="text-slate-600 text-xs font-semibold uppercase tracking-wide">Logo</Label>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden ring-1 ring-slate-200/80 bg-slate-50">
            <Image
              src={logoUrl}
              alt="Logo del comercio"
              fill
              className="object-contain p-1"
              unoptimized
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            className="text-slate-500 hover:text-red-600 hover:border-red-200 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Quitar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-slate-600 text-xs font-semibold uppercase tracking-wide">Logo</Label>
      {/* biome-ignore lint/a11y/useSemanticElements: drop zone requires div for drag events; hidden file input provides accessible interaction */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed px-6 py-8
          transition-colors text-center
          ${
            dragOver
              ? "border-blue-400 bg-blue-50/50"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
          }
        `}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm text-slate-500">Subiendo...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-600 font-medium">Arrastra o haz clic para subir</p>
            <p className="text-xs text-slate-400">PNG, JPG, SVG &middot; Max 2MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
}

// ── Sidebar Preview ─────────────────────────────────────────────────

const previewNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Mi Pase", icon: CreditCard, active: false },
  { label: "Clientes", icon: Users, active: false },
  { label: "Cajeros", icon: UserCheck, active: false },
  { label: "Analitica", icon: BarChart3, active: false },
  { label: "Campanas", icon: Megaphone, active: false },
  { label: "Configuracion", icon: Settings, active: false },
]

function SidebarPreview({
  primaryColor,
  accentColor,
  logoUrl,
  tenantName,
}: {
  primaryColor: string
  accentColor: string
  logoUrl: string | null
  tenantName: string
}) {
  const initial = getInitial(tenantName)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Sidebar del panel
      </p>
      <div className="rounded-xl overflow-hidden shadow-md ring-1 ring-slate-900/5">
        {/* Sidebar mockup */}
        <div className="w-full bg-[#0f172a] p-3" style={{ minHeight: 320 }}>
          {/* Logo area */}
          <div className="flex items-center gap-2 px-2 pb-3 mb-2 border-b border-white/10">
            {logoUrl ? (
              <div className="w-7 h-7 rounded-md overflow-hidden bg-white/10 flex-shrink-0">
                {/* biome-ignore lint/performance/noImgElement: preview mockup with external/data URIs, next/image incompatible */}
                <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  backgroundColor: primaryColor,
                  color: contrastText(primaryColor),
                }}
              >
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-white/90 font-semibold text-[11px] leading-none truncate">
                {tenantName}
              </div>
              <div className="text-white/30 text-[9px] mt-0.5">Cuik Platform</div>
            </div>
          </div>

          {/* Nav items */}
          <div className="space-y-0.5 px-0.5">
            {previewNavItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors"
                style={
                  item.active
                    ? {
                        backgroundColor: primaryColor,
                        color: contrastText(primaryColor),
                      }
                    : {
                        color: "rgba(255,255,255,0.45)",
                      }
                }
              >
                <item.icon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.label === "Campanas" && (
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Bottom */}
          <div className="mt-3 pt-2 border-t border-white/10 px-2">
            <div className="flex items-center gap-2 text-white/30 text-[10px]">
              <LogOut className="w-3 h-3" />
              <span>Salir</span>
            </div>
          </div>
        </div>

        {/* Simulated top bar to complete the mockup */}
        <div className="bg-white border-t border-slate-100 px-3 py-2 flex items-center justify-between">
          <div className="w-8 h-1.5 rounded bg-slate-100" />
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Bell className="w-3 h-3 text-slate-300" />
              <span
                className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
            </div>
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{
                backgroundColor: primaryColor,
                color: contrastText(primaryColor),
              }}
            >
              {initial}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Registration Preview ────────────────────────────────────────────

function RegistrationPreview({
  primaryColor,
  accentColor: _accentColor,
  logoUrl,
  tenantName,
}: {
  primaryColor: string
  accentColor: string
  logoUrl: string | null
  tenantName: string
}) {
  const initial = getInitial(tenantName)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Pagina de registro
      </p>
      <div className="rounded-xl overflow-hidden shadow-md ring-1 ring-slate-900/5 bg-slate-50">
        {/* Header band */}
        <div
          className="px-4 py-5 text-center"
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
          }}
        >
          {logoUrl ? (
            <div className="mx-auto mb-2 w-10 h-10 rounded-full overflow-hidden bg-white/20 shadow-sm">
              {/* biome-ignore lint/performance/noImgElement: preview mockup with external/data URIs, next/image incompatible */}
              <img src={logoUrl} alt="" className="w-full h-full object-contain p-0.5" />
            </div>
          ) : (
            <div
              className="mx-auto mb-2 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                color: contrastText(primaryColor),
              }}
            >
              {initial}
            </div>
          )}
          <div className="font-bold text-sm" style={{ color: contrastText(primaryColor) }}>
            {tenantName}
          </div>
          <div
            className="text-[10px] mt-0.5 opacity-80"
            style={{ color: contrastText(primaryColor) }}
          >
            Registro de Cliente
          </div>
        </div>

        {/* Form mockup */}
        <div className="px-4 py-3 -mt-2 relative">
          <div className="bg-white rounded-lg shadow-sm ring-1 ring-slate-100 p-3 space-y-2">
            <div className="h-3 w-12 rounded bg-slate-100" />
            <div className="h-6 rounded border border-slate-150 bg-slate-50/80" />
            <div className="h-3 w-10 rounded bg-slate-100" />
            <div className="h-6 rounded border border-slate-150 bg-slate-50/80" />
            <div className="h-3 w-14 rounded bg-slate-100" />
            <div className="h-6 rounded border border-slate-150 bg-slate-50/80" />
            <div
              className="h-7 rounded-md flex items-center justify-center text-[9px] font-semibold mt-1"
              style={{
                backgroundColor: primaryColor,
                color: contrastText(primaryColor),
              }}
            >
              Registrarme
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────

export default function BrandingPage() {
  // Data state
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(true)
  const [selectedTenantId, setSelectedTenantId] = useState<string>("")
  const [brandingLoading, setBrandingLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState<FormState>({
    primaryColor: DEFAULT_PRIMARY,
    accentColor: DEFAULT_ACCENT,
    logoUrl: null,
  })

  // Suggestions from published pass
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)

  // Track if form has been modified
  const [originalForm, setOriginalForm] = useState<FormState | null>(null)
  const hasChanges = originalForm !== null && JSON.stringify(form) !== JSON.stringify(originalForm)

  // ── Load tenants on mount ───────────────────────────────────────

  useEffect(() => {
    async function load() {
      setTenantsLoading(true)
      const result = await listTenantsForBranding()
      if (result.success) {
        setTenants(result.data)
      } else {
        toast.error(result.error)
      }
      setTenantsLoading(false)
    }
    load()
  }, [])

  // ── Load branding when tenant changes ───────────────────────────

  const loadBranding = useCallback(async (tenantId: string) => {
    setBrandingLoading(true)
    setSuggestions(null)

    const result = await getBranding(tenantId)

    if (!result.success) {
      toast.error(result.error)
      setBrandingLoading(false)
      return
    }

    if (result.data) {
      // Existing branding
      const newForm: FormState = {
        primaryColor: result.data.primaryColor,
        accentColor: result.data.accentColor,
        logoUrl: result.data.logoUrl,
      }
      setForm(newForm)
      setOriginalForm(newForm)
    } else {
      // No branding — check for pass color suggestions
      const passResult = await getPublishedPassColors(tenantId)

      const newForm: FormState = {
        primaryColor: DEFAULT_PRIMARY,
        accentColor: DEFAULT_ACCENT,
        logoUrl: null,
      }

      if (passResult.success && passResult.data) {
        newForm.primaryColor = passResult.data.suggestedPrimary
        newForm.accentColor = passResult.data.suggestedAccent
        setSuggestions(passResult.data)
      }

      setForm(newForm)
      setOriginalForm(newForm)
    }

    setBrandingLoading(false)
  }, [])

  function handleTenantChange(tenantId: string) {
    setSelectedTenantId(tenantId)
    loadBranding(tenantId)
  }

  // ── Form handlers ───────────────────────────────────────────────

  function updateColor(field: "primaryColor" | "accentColor") {
    return (value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }))
    }
  }

  function handleLogoUpload(url: string) {
    setForm((prev) => ({ ...prev, logoUrl: url }))
  }

  function handleLogoRemove() {
    setForm((prev) => ({ ...prev, logoUrl: null }))
  }

  function handleReset() {
    if (originalForm) {
      setForm({ ...originalForm })
    }
  }

  async function handleSave() {
    if (!selectedTenantId) return

    setSaving(true)
    try {
      const result = await saveBranding(selectedTenantId, {
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        logoUrl: form.logoUrl,
      })

      if (result.success) {
        toast.success("Branding guardado correctamente")
        setOriginalForm({ ...form })
        setSuggestions(null)
      } else {
        toast.error(result.error)
      }
    } catch (err) {
      console.error("[branding handleSave]", err)
      toast.error(
        err instanceof Error ? `Error al guardar: ${err.message}` : "Error de conexión al guardar branding",
      )
    } finally {
      setSaving(false)
    }
  }

  // ── Derived values ──────────────────────────────────────────────

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId)
  const tenantName = selectedTenant?.businessName ?? "Comercio"

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Palette className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Identidad de Marca</h1>
        </div>
        <p className="text-sm text-slate-500 ml-[30px]">
          Configura los colores y logo que el comercio vera en su panel y paginas publicas
        </p>
      </div>

      {/* Tenant selector */}
      <div className="mb-8">
        <Label className="text-slate-600 text-xs font-semibold uppercase tracking-wide mb-2">
          Comercio
        </Label>
        {tenantsLoading ? (
          <Skeleton className="h-9 w-full max-w-xs" />
        ) : (
          <Select value={selectedTenantId} onValueChange={handleTenantChange}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Seleccionar comercio..." />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex w-5 h-5 rounded items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{
                        backgroundColor: t.branding?.primaryColor ?? DEFAULT_PRIMARY,
                        color: contrastText(t.branding?.primaryColor ?? DEFAULT_PRIMARY),
                      }}
                    >
                      {getInitial(t.businessName)}
                    </span>
                    <span>{t.businessName}</span>
                    {t.branding && (
                      <span className="ml-auto text-[10px] text-slate-400">configurado</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Empty state */}
      {!selectedTenantId && !tenantsLoading && (
        <div className="py-20 text-center">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-slate-100 items-center justify-center mb-4">
            <Palette className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            Selecciona un comercio para configurar su identidad visual
          </p>
        </div>
      )}

      {/* Loading state */}
      {brandingLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10">
          <div className="space-y-6">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      )}

      {/* Main editor */}
      {selectedTenantId && !brandingLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 items-start">
          {/* LEFT: Config form */}
          <div className="space-y-8">
            {/* Colors section */}
            <section>
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                <span className="w-1 h-4 rounded-full bg-blue-500 inline-block" />
                Colores
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <ColorPicker
                  label="Primario"
                  value={form.primaryColor}
                  onChange={updateColor("primaryColor")}
                  suggestion={suggestions?.suggestedPrimary}
                />
                <ColorPicker
                  label="Acento"
                  value={form.accentColor}
                  onChange={updateColor("accentColor")}
                  suggestion={suggestions?.suggestedAccent}
                />
              </div>
            </section>

            {/* Divider */}
            <div className="border-t border-slate-100" />

            {/* Logo section */}
            <section>
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-1.5">
                <span className="w-1 h-4 rounded-full bg-blue-500 inline-block" />
                Logo
              </h2>
              <LogoUploader
                logoUrl={form.logoUrl}
                tenantId={selectedTenantId}
                onUpload={handleLogoUpload}
                onRemove={handleLogoRemove}
              />
            </section>

            {/* Divider */}
            <div className="border-t border-slate-100" />

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                variant="ghost"
                onClick={handleReset}
                disabled={!hasChanges}
                className="text-slate-500 gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Deshacer
              </Button>
            </div>
          </div>

          {/* RIGHT: Live previews */}
          <div className="lg:sticky lg:top-6 space-y-8">
            <SidebarPreview
              primaryColor={form.primaryColor}
              accentColor={form.accentColor}
              logoUrl={form.logoUrl}
              tenantName={tenantName}
            />
            <RegistrationPreview
              primaryColor={form.primaryColor}
              accentColor={form.accentColor}
              logoUrl={form.logoUrl}
              tenantName={tenantName}
            />
          </div>
        </div>
      )}
    </div>
  )
}
