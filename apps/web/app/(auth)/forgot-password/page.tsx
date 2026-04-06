"use client"

import { ArrowLeft, CheckCircle2, Mail, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const handleRequestReset = async () => {
    setLoading(true)
    setError("")

    try {
      const { error: apiError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      })

      if (apiError) {
        setError(apiError.message ?? "Ocurrió un error. Intentá de nuevo.")
        setLoading(false)
        return
      }

      setSent(true)
    } catch {
      setError("Error de conexión. Intentá de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    void handleRequestReset()
  }

  const handleResend = () => {
    setSent(false)
    void handleRequestReset()
  }

  return (
    <div className="min-h-screen bg-[#f0f6ff] flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#0e70db]/5" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#0e70db]/5" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <CuikLogo size="lg" className="mb-4" />
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Recuperar contraseña
          </h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Ingresa tu email y te enviaremos instrucciones para restablecer tu contraseña
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-7 space-y-5">
          {sent ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <div className="relative">
                  <Mail className="w-7 h-7 text-emerald-600" />
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute -bottom-1 -right-1 bg-emerald-100 rounded-full" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900">¡Revisá tu correo!</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Enviamos instrucciones de recuperación a{" "}
                <span className="font-semibold text-gray-700">{email}</span>. Revisá tu bandeja de
                entrada y spam.
              </p>
              <div className="flex flex-col gap-3 pt-2">
                <Link href="/login">
                  <Button variant="outline" className="w-full h-11 font-semibold text-sm gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Volver al login
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-xs text-gray-500 hover:text-[#0e70db] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                  ¿No recibiste el email? Reenviar
                </button>
              </div>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-4 h-4" /> Volver al login
              </Link>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="text-xs font-semibold text-gray-600 block mb-1.5"
                  >
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError("")
                      }}
                      className="h-11 pl-10"
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#0e70db] hover:bg-[#0a5fc2] text-white font-semibold text-sm gap-2"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    <>
                      Enviar instrucciones <Mail className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-xs text-center text-gray-400">
                ¿Recordaste tu contraseña?{" "}
                <Link href="/login" className="text-[#0e70db] font-semibold hover:underline">
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
