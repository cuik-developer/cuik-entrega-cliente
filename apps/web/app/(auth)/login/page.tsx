"use client"

import { ROLE_REDIRECTS, type Role } from "@cuik/shared"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { toast } from "sonner"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

const BUSINESS_TYPES = [
  "Cafetería",
  "Barbería",
  "Veterinaria",
  "Restaurante",
  "Gimnasio",
  "Nail Bar",
  "Pastelería",
  "Autolavado",
  "Otro",
]

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

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

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialView = searchParams.get("view") === "demo" ? "demo" : "login"
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"))
  const [view, setView] = useState<"login" | "demo">(initialView)

  // Login state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Demo form state
  const [demoForm, setDemoForm] = useState({
    businessName: "",
    businessType: "",
    contactName: "",
    email: "",
    phone: "",
    city: "",
    message: "",
  })
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoSent, setDemoSent] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError("")

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message ?? "Error al iniciar sesión")
        toast.error(result.error.message ?? "Error al iniciar sesión")
        setLoading(false)
        return
      }

      const sessionRes = await authClient.getSession()
      const userRole = ((sessionRes.data?.user as { role?: string } | undefined)?.role ??
        "user") as Role
      const defaultRedirect = ROLE_REDIRECTS[userRole] ?? "/cajero/escanear"
      const redirectTo = callbackUrl ?? defaultRedirect

      toast.success("Sesión iniciada correctamente")
      router.push(redirectTo)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado al iniciar sesión"
      setError(message)
      toast.error(message)
      setLoading(false)
    }
  }

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDemoLoading(true)

    try {
      const res = await fetch("/api/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: demoForm.businessName,
          businessType: demoForm.businessType,
          contactName: demoForm.contactName,
          email: demoForm.email,
          phone: demoForm.phone,
          city: demoForm.city,
          message: demoForm.message || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Error al enviar la solicitud")
        setDemoLoading(false)
        return
      }

      setDemoSent(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado"
      toast.error(message)
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── Left Panel (image + branding) ─── */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-[#0f172a] overflow-hidden">
        {/* Background image */}
        <Image
          src="/landing/hero-cafe.png"
          alt="Comercio usando Cuik"
          fill
          className="object-cover opacity-30"
          priority
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/60 to-[#0e70db]/20" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-10 w-full">
          <Link href="/" className="flex items-center gap-2.5 group w-fit">
            <CuikLogo size="sm" />
            <span className="text-white font-extrabold text-xl tracking-tight group-hover:text-blue-300 transition-colors">
              Cuik
            </span>
          </Link>

          <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-white leading-tight tracking-tight">
              Convierte cada visita en un cliente que vuelve
            </h2>
            <p className="text-blue-200/70 text-sm leading-relaxed max-w-sm">
              Pases de fidelización digitales en Apple y Google Wallet. Sin apps. Sin cartón. Todo
              desde tu panel.
            </p>
            <div className="flex gap-6 pt-2">
              {[
                { value: "500+", label: "Comercios" },
                { value: "50K+", label: "Clientes" },
                { value: "40%", label: "Retención" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-xl font-extrabold text-white">{stat.value}</div>
                  <div className="text-xs text-blue-300/50 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-blue-300/30 text-xs">© 2026 Cuik · Hecho con amor en Lima, Perú</p>
        </div>
      </div>

      {/* ─── Right Panel (form) ─── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-10 bg-gray-50/80 relative">
        {/* Subtle background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-[#0e70db]/[0.04] blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-[#ff4810]/[0.03] blur-3xl" />
        </div>

        {/* Back to landing (mobile only shows logo here, desktop has left panel) */}
        <div className="w-full max-w-md relative">
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#0e70db] transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">Volver al inicio</span>
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <CuikLogo size="sm" />
              <span className="text-lg font-extrabold text-gray-900 tracking-tight">Cuik</span>
            </div>
            <div className="w-20" /> {/* Spacer for centering */}
          </div>

          {view === "login" ? (
            <>
              {/* Heading */}
              <div className="mb-7">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                  Iniciar sesión
                </h1>
                <p className="text-gray-500 text-sm mt-1">Ingresa tu email y contraseña</p>
              </div>

              {/* Login card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6 space-y-5">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleLogin()
                  }}
                >
                  <div>
                    <label
                      htmlFor="login-email"
                      className="text-xs font-semibold text-gray-600 block mb-1.5"
                    >
                      Correo electrónico
                    </label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError("")
                      }}
                      className="h-11 rounded-xl"
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="login-password"
                      className="text-xs font-semibold text-gray-600 block mb-1.5"
                    >
                      Contraseña
                    </label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setError("")
                        }}
                        className="h-11 pr-10 rounded-xl"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex justify-end mt-1.5">
                      <Link
                        href="/forgot-password"
                        className="text-xs text-[#0e70db] font-medium hover:underline underline-offset-2"
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
                    </div>
                  </div>

                  {error && (
                    <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2.5 border border-red-100">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-[#0e70db] hover:bg-[#0a5fc2] text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-200/40 hover:shadow-lg hover:shadow-blue-200/50 transition-all group"
                    disabled={loading || !email || !password}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Ingresando...
                      </span>
                    ) : (
                      <>
                        Ingresar
                        <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </div>

              {/* Demo request link */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500">
                  ¿Tienes un comercio?{" "}
                  <button
                    type="button"
                    className="text-[#0e70db] font-semibold hover:underline underline-offset-2"
                    onClick={() => setView("demo")}
                  >
                    Solicita tu demo gratis
                  </button>
                </p>
              </div>
            </>
          ) : (
            /* ─── Demo request form ─── */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6">
              {demoSent ? (
                <div className="py-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Solicitud enviada</h3>
                  <p className="text-gray-500 text-sm max-w-xs mx-auto">
                    Nuestro equipo te contactará en menos de 24h para armar tu pase digital.
                  </p>
                  <Button
                    className="mt-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl"
                    onClick={() => {
                      setDemoSent(false)
                      setView("login")
                      setDemoForm({
                        businessName: "",
                        businessType: "",
                        contactName: "",
                        email: "",
                        phone: "",
                        city: "",
                        message: "",
                      })
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Volver al login
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0e70db] transition-colors mb-5 group"
                    onClick={() => setView("login")}
                  >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />{" "}
                    Volver
                  </button>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    Lleva tu negocio al siguiente nivel
                  </h2>
                  <p className="text-sm text-gray-500 mb-5">
                    Completa el formulario y te contactamos en menos de 24h para armar tu pase
                    digital.
                  </p>

                  {/* Trust badges */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {[
                      { icon: <ShieldCheck className="w-3 h-3" />, label: "Sin compromiso" },
                      { icon: <Sparkles className="w-3 h-3" />, label: "Demo gratis 7 días" },
                      { icon: <Clock className="w-3 h-3" />, label: "Respuesta en 24h" },
                    ].map((badge) => (
                      <span
                        key={badge.label}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-[#0e70db] text-xs font-medium border border-blue-100/60"
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    ))}
                  </div>

                  <form className="space-y-4" onSubmit={handleDemoSubmit}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 col-span-2">
                        <label
                          htmlFor="demo-business-name"
                          className="text-xs font-semibold text-gray-600"
                        >
                          Nombre del comercio *
                        </label>
                        <input
                          id="demo-business-name"
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-all"
                          placeholder="Ej: Café Central"
                          value={demoForm.businessName}
                          onChange={(e) =>
                            setDemoForm((f) => ({ ...f, businessName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="demo-business-type"
                          className="text-xs font-semibold text-gray-600"
                        >
                          Tipo de negocio *
                        </label>
                        <select
                          id="demo-business-type"
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] bg-white transition-all"
                          value={demoForm.businessType}
                          onChange={(e) =>
                            setDemoForm((f) => ({ ...f, businessType: e.target.value }))
                          }
                        >
                          <option value="">Seleccionar...</option>
                          {BUSINESS_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="demo-city" className="text-xs font-semibold text-gray-600">
                          Ciudad *
                        </label>
                        <input
                          id="demo-city"
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-all"
                          placeholder="Ej: Lima"
                          value={demoForm.city}
                          onChange={(e) => setDemoForm((f) => ({ ...f, city: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="demo-contact-name"
                          className="text-xs font-semibold text-gray-600"
                        >
                          Tu nombre *
                        </label>
                        <input
                          id="demo-contact-name"
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-all"
                          placeholder="Ej: María García"
                          value={demoForm.contactName}
                          onChange={(e) =>
                            setDemoForm((f) => ({ ...f, contactName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="demo-email" className="text-xs font-semibold text-gray-600">
                          Email *
                        </label>
                        <input
                          id="demo-email"
                          required
                          type="email"
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-all"
                          placeholder="tu@email.com"
                          value={demoForm.email}
                          onChange={(e) => setDemoForm((f) => ({ ...f, email: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label htmlFor="demo-phone" className="text-xs font-semibold text-gray-600">
                          Teléfono / WhatsApp *
                        </label>
                        <input
                          id="demo-phone"
                          required
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-all"
                          placeholder="+51 999 000 111"
                          value={demoForm.phone}
                          onChange={(e) => setDemoForm((f) => ({ ...f, phone: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label
                          htmlFor="demo-message"
                          className="text-xs font-semibold text-gray-600"
                        >
                          Algo que quieras contarnos{" "}
                          <span className="text-gray-400 font-normal">(opcional)</span>
                        </label>
                        <textarea
                          id="demo-message"
                          rows={2}
                          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-all resize-none"
                          placeholder="Contanos sobre tu negocio, qué necesitas, o cualquier duda..."
                          value={demoForm.message}
                          onChange={(e) => setDemoForm((f) => ({ ...f, message: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={demoLoading}
                      className="w-full h-11 bg-[#ff4810] hover:bg-[#e03f0d] text-white font-semibold text-sm rounded-xl shadow-md shadow-orange-200/40 hover:shadow-lg transition-all group"
                    >
                      {demoLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Enviando...
                        </span>
                      ) : (
                        <>
                          Enviar solicitud
                          <ArrowRight className="ml-1 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </Button>
                    <p className="text-center text-xs text-gray-400">
                      Sin tarjeta de crédito. Sin compromisos. Al enviar, aceptas nuestros términos.
                    </p>
                  </form>
                </>
              )}
            </div>
          )}

          {/* Footer (mobile/right panel) */}
          <p className="text-center text-xs text-gray-400 mt-8 lg:hidden">
            © 2026 Cuik · Hecho con amor en Lima, Perú
          </p>
        </div>
      </div>
    </div>
  )
}
