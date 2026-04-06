"use client"

import type { TenantBranding } from "@cuik/shared/validators"
import { ArrowRight, CheckCircle2, Eye, EyeOff, Info, Lock, Mail, User } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { toast } from "sonner"
import { getInvitationInfo } from "@/app/(auth)/accept-invitation/[id]/actions"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { CUIK_PRIMARY, darkenColor } from "@/lib/color-utils"

/**
 * Validates a callbackUrl to prevent open redirect attacks.
 * Only allows relative paths starting with "/".
 */
function getSafeCallbackUrl(url: string | null): string | null {
  if (!url) return null
  // Must start with / and must NOT start with // (protocol-relative URL)
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url
  }
  return null
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  )
}

function validateFormFields(
  passwordValid: boolean,
  passwordsMatch: boolean,
  acceptTerms: boolean,
  setError: (msg: string) => void,
): boolean {
  if (!passwordValid) {
    setError("La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.")
    return false
  }
  if (!passwordsMatch) {
    setError("Las contraseñas no coinciden.")
    return false
  }
  if (!acceptTerms) {
    setError("Debés aceptar los términos y condiciones.")
    return false
  }
  return true
}

function useInvitationBranding(callbackUrl: string | null) {
  const invitationId = callbackUrl?.match(/\/accept-invitation\/(.+)/)?.[1] ?? null
  const [branding, setBranding] = useState<TenantBranding | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)

  useEffect(() => {
    if (!invitationId) return
    getInvitationInfo(invitationId)
      .then((result) => {
        if (result.success) {
          setBranding(result.data.branding)
          setOrgName(result.data.organizationName)
        }
      })
      .catch(() => {
        // Silent degradation — render with defaults
      })
  }, [invitationId])

  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY
  const primaryDark = darkenColor(primaryColor, 0.15)

  return { primaryColor, primaryDark, orgName }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: registration form with multi-field validation and conditional UI
function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"))

  const { primaryColor, primaryDark, orgName } = useInvitationBranding(callbackUrl)

  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [emailReadonly] = useState(false) // would be true if pre-filled from invitation
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const hasMinLength = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const passwordValid = hasMinLength && hasUppercase && hasNumber
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const formValid =
    nombre.trim() !== "" && email.trim() !== "" && passwordValid && passwordsMatch && acceptTerms

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateFormFields(passwordValid, passwordsMatch, acceptTerms, setError)) return

    setLoading(true)
    setError("")

    try {
      const result = await authClient.signUp.email({
        name: nombre.trim(),
        email: email.trim(),
        password,
      })

      if (result.error) {
        setError(result.error.message ?? "Error al crear la cuenta")
        toast.error(result.error.message ?? "Error al crear la cuenta")
        setLoading(false)
        return
      }

      setSuccess(true)
      toast.success("¡Cuenta creada!")
      setTimeout(() => {
        router.push(callbackUrl ?? "/panel")
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado al crear la cuenta"
      setError(message)
      toast.error(message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f6ff] flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full"
          style={{ backgroundColor: `${primaryColor}0D` }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full"
          style={{ backgroundColor: `${primaryColor}0D` }}
        />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <CuikLogo size="lg" className="mb-4" />
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Crear tu cuenta</h1>
          <p className="text-gray-500 text-sm mt-1">
            Completa tus datos para acceder al panel de tu comercio
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-7 space-y-5">
          {success ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">¡Cuenta creada!</h3>
              <p className="text-gray-500 text-sm">Redirigiendo al panel...</p>
              <div className="flex justify-center">
                <span
                  className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: `${primaryColor}4D`, borderTopColor: primaryColor }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Invitation info box */}
              <div
                className="flex gap-3 rounded-xl p-3 text-xs"
                style={{ backgroundColor: `${primaryColor}0F`, color: primaryColor }}
              >
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  {orgName
                    ? `Has sido invitado a unirte a ${orgName}. Crea tu cuenta para continuar.`
                    : "Esta invitación fue enviada por el equipo de Cuik."}{" "}
                  Si no recibiste una invitación,{" "}
                  <span className="font-semibold cursor-pointer hover:underline">contactanos</span>.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {/* Nombre completo */}
                <div>
                  <label
                    htmlFor="register-name"
                    className="text-xs font-semibold text-gray-600 block mb-1.5"
                  >
                    Nombre completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="register-name"
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => {
                        setNombre(e.target.value)
                        setError("")
                      }}
                      className="h-11 pl-10"
                      placeholder="Ej: María García"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="register-email"
                    className="text-xs font-semibold text-gray-600 block mb-1.5"
                  >
                    Email
                  </label>
                  <div className="relative">
                    {emailReadonly ? (
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    ) : (
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    )}
                    <Input
                      id="register-email"
                      type="email"
                      required
                      readOnly={emailReadonly}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError("")
                      }}
                      className={`h-11 pl-10 ${emailReadonly ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}`}
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                </div>

                {/* Contraseña */}
                <div>
                  <label
                    htmlFor="register-password"
                    className="text-xs font-semibold text-gray-600 block mb-1.5"
                  >
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError("")
                      }}
                      className="h-11 pl-10 pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password.length > 0 ? (
                    <div className="flex gap-3 mt-1.5">
                      <span
                        className={`text-xs ${hasMinLength ? "text-emerald-500" : "text-gray-400"}`}
                      >
                        {hasMinLength ? "✓" : "○"} 8+ caracteres
                      </span>
                      <span
                        className={`text-xs ${hasUppercase ? "text-emerald-500" : "text-gray-400"}`}
                      >
                        {hasUppercase ? "✓" : "○"} Mayúscula
                      </span>
                      <span
                        className={`text-xs ${hasNumber ? "text-emerald-500" : "text-gray-400"}`}
                      >
                        {hasNumber ? "✓" : "○"} Número
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">
                      Mínimo 8 caracteres, una mayúscula y un número
                    </p>
                  )}
                </div>

                {/* Confirmar contraseña */}
                <div>
                  <label
                    htmlFor="register-confirm-password"
                    className="text-xs font-semibold text-gray-600 block mb-1.5"
                  >
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="register-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setError("")
                      }}
                      className="h-11 pl-10 pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                  )}
                </div>

                {/* Terms checkbox */}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="terms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => {
                      setAcceptTerms(checked === true)
                      setError("")
                    }}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="terms"
                    className="text-xs text-gray-600 cursor-pointer leading-relaxed"
                  >
                    Acepto los{" "}
                    <span
                      className="font-semibold hover:underline cursor-pointer"
                      style={{ color: primaryColor }}
                    >
                      términos y condiciones
                    </span>
                  </label>
                </div>

                {error && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-white font-semibold text-sm gap-2"
                  style={{
                    backgroundColor: loading || !formValid ? "#9ca3af" : primaryColor,
                    cursor: loading || !formValid ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && formValid) e.currentTarget.style.backgroundColor = primaryDark
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && formValid) e.currentTarget.style.backgroundColor = primaryColor
                  }}
                  disabled={loading || !formValid}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Creando cuenta...
                    </span>
                  ) : (
                    <>
                      Crear cuenta <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-xs text-center text-gray-400">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href={
                    callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login"
                  }
                  className="font-semibold hover:underline"
                  style={{ color: primaryColor }}
                >
                  Iniciá sesión
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Cuik Platform · © 2026 · Hecho con amor en LATAM
        </p>
      </div>
    </div>
  )
}
