"use client"

import type { RegistrationConfig, StrategicField } from "@cuik/shared/validators"
import { buildRegistrationSchema } from "@cuik/shared/validators"
import {
  ArrowLeft,
  CheckCircle,
  CreditCard,
  Gift,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Smartphone,
  User,
} from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type RegistroStep = "email" | "form" | "sent"

interface RegistroClientProps {
  slug: string
  tenantName: string
  primaryColor: string
  accentColor: string
  logoUrl: string | null
  registrationConfig: RegistrationConfig | null
}

const RESEND_COOLDOWN_SECONDS = 60

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-step registration form with tightly coupled state
export default function RegistroClient({
  slug,
  tenantName,
  primaryColor,
  accentColor,
  logoUrl,
  registrationConfig,
}: RegistroClientProps) {
  const router = useRouter()
  const tenantInitial = tenantName.charAt(0).toUpperCase()

  // --- Dynamic schema ---
  const dynamicSchema = useMemo(
    () => buildRegistrationSchema(registrationConfig),
    [registrationConfig],
  )

  // --- State machine ---
  const [step, setStep] = useState<RegistroStep>("email")
  const [emailInput, setEmailInput] = useState("")
  const [checking, setChecking] = useState(false)

  // Resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Registration form state — basic fields
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    dni: "",
    telefono: "",
    email: "",
    birthday: "",
    aceptaTerminos: false,
    aceptaPromos: false,
  })

  // Strategic fields custom data (dynamic keys)
  const [customData, setCustomData] = useState<Record<string, string>>({})

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Validation ---
  const isFormValid = useMemo(() => {
    // Build the payload shape matching what the schema expects
    const payload: Record<string, unknown> = {
      name: form.nombre.trim(),
      lastName: form.apellido.trim() || undefined,
      dni: form.dni.trim() || undefined,
      phone: form.telefono.trim(),
      email: form.email.trim(),
      marketingOptIn: form.aceptaPromos,
    }

    // Add birthday if present
    if (form.birthday) {
      payload.birthday = form.birthday
    }

    // Add customData if any strategic fields have values
    const strategicFields = registrationConfig?.strategicFields ?? []
    if (strategicFields.length > 0) {
      const filteredCustomData: Record<string, string> = {}
      for (const field of strategicFields) {
        if (field.key === "birthday") continue
        const value = customData[field.key]
        if (value) {
          filteredCustomData[field.key] = value
        }
      }
      if (Object.keys(filteredCustomData).length > 0) {
        payload.customData = filteredCustomData
      }
    }

    const result = dynamicSchema.safeParse(payload)
    return result.success && form.aceptaTerminos
  }, [form, customData, dynamicSchema, registrationConfig])

  // --- Cooldown timer ---
  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  // --- Handlers ---

  function handleFormChange(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  function handleCustomDataChange(key: string, value: string) {
    setCustomData((prev) => ({ ...prev, [key]: value }))
    if (error) setError(null)
  }

  function goBackToEmail() {
    setStep("email")
    setError(null)
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = emailInput.trim()
    if (!trimmed || checking) return

    setChecking(true)
    setError(null)

    try {
      const res = await fetch(`/api/${slug}/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || "Error al verificar el email")
        setChecking(false)
        return
      }

      const exists = json.data?.exists ?? json.exists ?? false

      if (exists) {
        // Returning client — send pass link
        const sendRes = await fetch(`/api/${slug}/send-pass-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        })

        if (!sendRes.ok) {
          const sendData = await sendRes.json()
          setError(sendData.error || "Error al enviar el email")
          setChecking(false)
          return
        }

        startCooldown()
        setStep("sent")
      } else {
        // New client — go to full form
        setForm((prev) => ({ ...prev, email: trimmed }))
        setStep("form")
      }
    } catch (_err) {
      setError("Error de conexion. Intenta de nuevo.")
    } finally {
      setChecking(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return

    setError(null)
    try {
      const res = await fetch(`/api/${slug}/send-pass-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Error al reenviar el email")
        return
      }

      startCooldown()
    } catch (_err) {
      setError("Error de conexion. Intenta de nuevo.")
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential form submission with error handling
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isFormValid || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      // Build payload
      const payload: Record<string, unknown> = {
        name: form.nombre,
        lastName: form.apellido || undefined,
        dni: form.dni || undefined,
        phone: form.telefono,
        email: form.email,
        marketingOptIn: form.aceptaPromos,
      }

      // Add birthday if present
      if (form.birthday) {
        payload.birthday = form.birthday
      }

      // Add customData if any strategic fields have values
      const strategicFields = registrationConfig?.strategicFields ?? []
      if (strategicFields.length > 0) {
        const filteredCustomData: Record<string, string> = {}
        for (const field of strategicFields) {
          if (field.key === "birthday") continue
          const value = customData[field.key]
          if (value) {
            filteredCustomData[field.key] = value
          }
        }
        if (Object.keys(filteredCustomData).length > 0) {
          payload.customData = filteredCustomData
        }
      }

      const response = await fetch(`/api/${slug}/register-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Error al registrarse")
        setSubmitting(false)
        return
      }

      // Success — redirect to bienvenido with wallet URLs
      const walletUrls = data.data?.walletUrls || {}
      const clientName = form.nombre

      const searchParams = new URLSearchParams({
        nombre: clientName,
        ...(walletUrls.apple ? { apple: walletUrls.apple } : {}),
        ...(walletUrls.google ? { google: walletUrls.google } : {}),
      })

      setSuccess(true)
      setTimeout(() => {
        router.push(`/${slug}/bienvenido?${searchParams.toString()}`)
      }, 1500)
    } catch (_err) {
      setError("Error de conexion. Intenta de nuevo.")
      setSubmitting(false)
    }
  }

  // --- Determine which basic fields to show ---
  // When no config, show all basic fields for backward compat
  const _hasBirthdayField =
    registrationConfig?.strategicFields.some((f) => f.key === "birthday" || f.type === "date") ??
    false

  // --- Render strategic field ---
  function renderStrategicField(field: StrategicField) {
    // Birthday is handled as a basic field
    if (field.key === "birthday") {
      return (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor="birthday" className="text-gray-700">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <Input
            id="birthday"
            type="date"
            required={field.required}
            value={form.birthday}
            onChange={(e) => handleFormChange("birthday", e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            min={
              new Date(Date.now() - 120 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            }
          />
        </div>
      )
    }

    switch (field.type) {
      case "text":
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`strategic-${field.key}`} className="text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <Input
              id={`strategic-${field.key}`}
              type="text"
              required={field.required}
              value={customData[field.key] ?? ""}
              onChange={(e) => handleCustomDataChange(field.key, e.target.value)}
              placeholder={field.placeholder ?? ""}
            />
          </div>
        )

      case "select":
      case "location_select":
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`strategic-${field.key}`} className="text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <Select
              value={customData[field.key] ?? ""}
              onValueChange={(value) => handleCustomDataChange(field.key, value)}
            >
              <SelectTrigger id={`strategic-${field.key}`}>
                <SelectValue
                  placeholder={field.placeholder ?? `Seleccionar ${field.label.toLowerCase()}`}
                />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      case "date":
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`strategic-${field.key}`} className="text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <Input
              id={`strategic-${field.key}`}
              type="date"
              required={field.required}
              value={customData[field.key] ?? ""}
              onChange={(e) => handleCustomDataChange(field.key, e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              min={
                new Date(Date.now() - 120 * 365.25 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0]
              }
            />
          </div>
        )

      default:
        return null
    }
  }

  // --- Marketing bonus label ---
  const _marketingBonusEnabled = registrationConfig?.marketingBonus?.enabled ?? false
  const marketingBonusLabel = (() => {
    if (!registrationConfig?.marketingBonus?.enabled) return null
    const { stampsBonus, pointsBonus } = registrationConfig.marketingBonus
    if (stampsBonus > 0) return `+${stampsBonus} ${stampsBonus === 1 ? "sello" : "sellos"} bonus!`
    if (pointsBonus > 0) return `+${pointsBonus} puntos bonus!`
    return "+1 visita bonus!"
  })()

  // --- Success screen (after registration) ---
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center space-y-4 animate-in fade-in duration-500">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: primaryColor }}
          >
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Registro exitoso!</h1>
          <p className="text-gray-500">Redirigiendo a tu pase...</p>
          <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: primaryColor }} />
        </div>
      </div>
    )
  }

  // --- Header (shared across all steps) ---
  const header = (
    <div
      className="w-full px-4 pt-8 pb-10 text-center text-white"
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
      }}
    >
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={tenantName}
          width={64}
          height={64}
          className="mx-auto mb-3 h-16 w-16 rounded-full object-cover shadow-lg"
        />
      ) : (
        <div
          className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold shadow-lg"
          style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
        >
          {tenantInitial}
        </div>
      )}
      <h1 className="text-xl font-bold">{tenantName}</h1>
      <p className="mt-3 text-sm text-white/90 max-w-xs mx-auto">
        {step === "sent"
          ? "Revisa tu correo para acceder a tu pase"
          : "Registrate y obtene tu tarjeta de fidelizacion digital"}
      </p>
    </div>
  )

  // --- Wallet preview (shared for email and form steps) ---
  const walletPreview = (
    <Card className="mt-4 border-dashed">
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          <Smartphone className="h-5 w-5" style={{ color: primaryColor }} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            Tu pase digital en Apple Wallet y Google Wallet
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Sin descargar apps &bull; Siempre en tu billetera digital
          </p>
        </div>
      </CardContent>
    </Card>
  )

  // --- Error banner (shared) ---
  const errorBanner = error ? (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {error}
    </div>
  ) : null

  // =====================
  // STEP: email (initial)
  // =====================
  if (step === "email") {
    return (
      <div className="min-h-screen bg-gray-50">
        {header}
        <div className="px-4 -mt-4 pb-8 max-w-md mx-auto">
          <Card className="shadow-lg">
            <CardContent className="pt-2">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {errorBanner}

                <div className="space-y-1.5">
                  <Label htmlFor="email-step" className="text-gray-700">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </Label>
                  <Input
                    id="email-step"
                    type="email"
                    required
                    autoFocus
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="juan@email.com"
                  />
                  <p className="text-xs text-gray-500">
                    Ingresa tu email para empezar. Si ya tienes cuenta, te enviamos tu pase.
                  </p>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-white font-semibold mt-2"
                  style={{ backgroundColor: primaryColor }}
                  disabled={!emailInput.trim() || checking}
                >
                  {checking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    "Continuar"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {walletPreview}
        </div>
      </div>
    )
  }

  // =====================
  // STEP: form (new client)
  // =====================
  if (step === "form") {
    const strategicFields = registrationConfig?.strategicFields ?? []

    return (
      <div className="min-h-screen bg-gray-50">
        {header}
        <div className="px-4 -mt-4 pb-8 max-w-md mx-auto">
          <Card className="shadow-lg">
            <CardContent className="pt-2">
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {errorBanner}

                {/* Nombre (always shown) */}
                <div className="space-y-1.5">
                  <Label htmlFor="nombre" className="text-gray-700">
                    <User className="h-3.5 w-3.5" />
                    Nombre
                  </Label>
                  <Input
                    id="nombre"
                    type="text"
                    required
                    autoFocus
                    value={form.nombre}
                    onChange={(e) => handleFormChange("nombre", e.target.value)}
                    placeholder="Juan"
                  />
                </div>

                {/* Apellido */}
                <div className="space-y-1.5">
                  <Label htmlFor="apellido" className="text-gray-700">
                    <User className="h-3.5 w-3.5" />
                    Apellido
                  </Label>
                  <Input
                    id="apellido"
                    type="text"
                    value={form.apellido}
                    onChange={(e) => handleFormChange("apellido", e.target.value)}
                    placeholder="Perez"
                  />
                </div>

                {/* DNI */}
                <div className="space-y-1.5">
                  <Label htmlFor="dni" className="text-gray-700">
                    <CreditCard className="h-3.5 w-3.5" />
                    DNI
                  </Label>
                  <Input
                    id="dni"
                    type="text"
                    value={form.dni}
                    onChange={(e) => handleFormChange("dni", e.target.value)}
                    placeholder="12345678"
                  />
                </div>

                {/* Telefono */}
                <div className="space-y-1.5">
                  <Label htmlFor="telefono" className="text-gray-700">
                    <Phone className="h-3.5 w-3.5" />
                    Telefono
                  </Label>
                  <Input
                    id="telefono"
                    type="tel"
                    required
                    value={form.telefono}
                    onChange={(e) => handleFormChange("telefono", e.target.value)}
                    placeholder="+51 999 999 999"
                  />
                </div>

                {/* Email — pre-filled, readonly */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-gray-700">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    readOnly
                    value={form.email}
                    className="bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={goBackToEmail}
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                    style={{ color: primaryColor }}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Cambiar email
                  </button>
                </div>

                {/* Strategic fields (dynamic) */}
                {strategicFields.length > 0 &&
                  strategicFields.map((field) => renderStrategicField(field))}

                {/* Checkboxes */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terminos"
                      checked={form.aceptaTerminos}
                      onCheckedChange={(checked) =>
                        handleFormChange("aceptaTerminos", checked === true)
                      }
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="terminos"
                      className="text-sm text-gray-600 font-normal leading-snug cursor-pointer"
                    >
                      Acepto los terminos y condiciones
                    </Label>
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="promos"
                      checked={form.aceptaPromos}
                      onCheckedChange={(checked) =>
                        handleFormChange("aceptaPromos", checked === true)
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Label
                          htmlFor="promos"
                          className="text-sm text-gray-600 font-normal leading-snug cursor-pointer"
                        >
                          Quiero recibir promociones y novedades
                        </Label>
                        {registrationConfig?.marketingBonus?.enabled && (
                          <Badge
                            className="text-[10px] px-1.5 py-0"
                            style={{
                              backgroundColor: accentColor,
                              color: "white",
                              borderColor: "transparent",
                            }}
                          >
                            <Gift className="h-2.5 w-2.5" />
                            {marketingBonusLabel}
                          </Badge>
                        )}
                      </div>
                      {registrationConfig?.marketingBonus?.enabled && (
                        <p className="text-xs text-gray-400 mt-1">
                          {registrationConfig.marketingBonus.stampsBonus > 0
                            ? `Si aceptas, te regalamos ${registrationConfig.marketingBonus.stampsBonus} ${registrationConfig.marketingBonus.stampsBonus === 1 ? "sello" : "sellos"} como incentivo`
                            : registrationConfig.marketingBonus.pointsBonus > 0
                              ? `Si aceptas, te regalamos ${registrationConfig.marketingBonus.pointsBonus} puntos como incentivo`
                              : "Si aceptas, recibes un incentivo de bienvenida"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-white font-semibold mt-2"
                  style={{ backgroundColor: primaryColor }}
                  disabled={!isFormValid || submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    "Registrarme y obtener mi pase"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {walletPreview}
        </div>
      </div>
    )
  }

  // =====================
  // STEP: sent (returning client)
  // =====================
  return (
    <div className="min-h-screen bg-gray-50">
      {header}
      <div className="px-4 -mt-4 pb-8 max-w-md mx-auto">
        <Card className="shadow-lg">
          <CardContent className="pt-6 pb-6">
            <div className="text-center space-y-4">
              {/* Mail icon */}
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Mail className="h-8 w-8" style={{ color: primaryColor }} />
              </div>

              <h2 className="text-xl font-bold text-gray-900">Revisa tu correo!</h2>

              <p className="text-sm text-gray-600 max-w-xs mx-auto">
                Enviamos un link a{" "}
                <span className="font-medium text-gray-900">{emailInput.trim()}</span> para que
                accedas a tu pase de {tenantName}.
              </p>

              <p className="text-xs text-gray-500">
                Revisa tu bandeja de entrada (y spam por las dudas).
              </p>

              {errorBanner}

              {/* Resend button */}
              <div className="pt-2">
                <p className="text-xs text-gray-500 mb-2">No recibiste el email?</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${resendCooldown > 0 ? "" : ""}`} />
                  {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : "Reenviar"}
                </Button>
              </div>

              {/* Back to email */}
              <button
                type="button"
                onClick={goBackToEmail}
                className="inline-flex items-center gap-1 text-sm hover:underline mx-auto"
                style={{ color: primaryColor }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Usar otro email
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
